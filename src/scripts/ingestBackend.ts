import type Database from 'better-sqlite3';
import type { FlexMatchIdsOptions } from '../lib/riot';
import type { MatchDto } from '../lib/types';
import { validateMatch } from '../lib/matchValidation';
import { validatedLineup } from '../lib/stats/shared';

interface RiotClient {
	getFlexMatchIds(puuid: string, options: FlexMatchIdsOptions): Promise<string[]>;
	getMatch(id: string): Promise<MatchDto>;
}

export async function ingest(database: Database.Database, client: RiotClient, backfill = false) {
	const startedAt = Date.now();
	let newMatches = 0;
	const failures: string[] = [];
	const players = database.prepare('SELECT puuid FROM players').all() as { puuid: string }[];
	const roster = new Set(players.map((player) => player.puuid));
	try {
		if (!roster.size) throw new Error('No players in DB; run resolvePuids first');
		const enqueue = database.prepare('INSERT OR IGNORE INTO ingest_pending (match_id) VALUES (?)');
		database.prepare(`INSERT OR IGNORE INTO ingest_pending (match_id)
			SELECT m.match_id FROM matches AS m
			WHERE m.raw_json IS NULL OR NOT EXISTS (SELECT 1 FROM participants AS p WHERE p.match_id = m.match_id)
				OR EXISTS (SELECT 1 FROM participants AS p WHERE p.match_id = m.match_id
					AND (p.lineup_size IS NULL OR p.lineup_size !=
						(SELECT COUNT(*) FROM participants AS candidate WHERE candidate.match_id = m.match_id)))`).run();
		for (const { puuid } of players) {
			try {
				const cursor = database.prepare('SELECT start_time FROM ingest_cursors WHERE puuid = ?').get(puuid) as { start_time: number } | undefined;
				const startTime = backfill ? undefined : cursor?.start_time;
				const pages = new Set<string>();
				for (let start = 0; ; start += 100) {
					const ids = await client.getFlexMatchIds(puuid, { start, count: 100, startTime });
					if (ids.length && ids.every((id) => pages.has(id))) throw new Error('Riot pagination made no progress');
					database.transaction(() => { for (const id of ids) { enqueue.run(id); pages.add(id); } })();
					if (ids.length < 100) break;
				}
				database.prepare(`INSERT INTO ingest_cursors VALUES (?, ?) ON CONFLICT(puuid) DO UPDATE SET start_time = excluded.start_time`)
					// Overlap covers matches still in progress or awaiting Riot indexing during collection.
					.run(puuid, Math.max(0, Math.floor(startedAt / 1000) - 24 * 60 * 60));
			} catch (error) {
				failures.push(`Collection ${puuid}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		const pending = database.prepare('SELECT match_id FROM ingest_pending').all() as { match_id: string }[];
		const remove = database.prepare('DELETE FROM ingest_pending WHERE match_id = ?');
		for (const { match_id: id } of pending) {
			try {
				const existing = database.prepare(`SELECT raw_json AS rawJson, game_start_ts AS startedAt, duration_s AS durationS
					FROM matches WHERE match_id = ?`).get(id) as { rawJson: string | null; startedAt: number | null; durationS: number | null } | undefined;
				if (existing) {
					try {
						if (existing.rawJson === null || existing.startedAt === null || existing.durationS === null) throw new Error('Missing raw data');
						validatedLineup(database, id, existing.rawJson, existing.startedAt, existing.durationS);
						remove.run(id);
						continue;
					} catch {
						// Legacy non-atomic ingestion may have left an incomplete row. Refetch before replacing it.
					}
				}
				const match = validateMatch(await client.getMatch(id), id);
				const { info } = match;
				const ours = info.participants.filter((participant) => roster.has(participant.puuid));
				if (info.queueId !== 440 || !ours.length) {
					if (existing) throw new Error('Cannot repair existing match without a flex roster lineup');
					remove.run(id); continue;
				}
				if (ours.some((p) => p.teamId !== ours[0].teamId)) throw new Error('Roster spans opposing teams');
				database.transaction(() => {
					if (existing) {
						database.prepare('DELETE FROM participants WHERE match_id = ?').run(id);
						database.prepare('DELETE FROM matches WHERE match_id = ?').run(id);
					}
					database.prepare('INSERT INTO matches (match_id, game_start_ts, duration_s, queue_id, raw_json) VALUES (?,?,?,?,?)')
						.run(id, info.gameCreation, info.gameDuration, info.queueId, JSON.stringify(match));
					const insert = database.prepare(`INSERT INTO participants
						(match_id, puuid, champion, role, kills, deaths, assists, win, lineup_size) VALUES (?,?,?,?,?,?,?,?,?)`);
					const rename = database.prepare('UPDATE players SET game_name = ?, tag_line = ? WHERE puuid = ?');
					for (const p of ours) {
						insert.run(id, p.puuid, p.championName, p.individualPosition, p.kills, p.deaths, p.assists, Number(p.win), ours.length);
						rename.run(p.riotIdGameName, p.riotIdTagline, p.puuid);
					}
					remove.run(id);
				})();
				if (!existing && ours.length >= 2) newMatches++;
			} catch (error) {
				failures.push(`Match ${id}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	} catch (error) {
		failures.push(error instanceof Error ? error.message : String(error));
	}
	database.prepare('INSERT INTO ingest_runs (started_at, new_matches, status) VALUES (?, ?, ?)')
		.run(startedAt, newMatches, failures.length ? 'failed' : 'ok');
	return { newMatches, failures };
}
