import type Database from 'better-sqlite3';
import type { FlexMatchIdsOptions } from '../lib/riot';
import type { LeagueEntryDto, MatchDto } from '../lib/types';
import { validateMatch } from '../lib/matchValidation';
import { validatedLineup } from '../lib/stats/shared';
import { deferredRetryDelay, RateLimitError } from '../lib/backendHttp';
import { collectTimelines } from './timelineBackend';

const MATCH_PAGE_SIZE = 100;
const BACKFILL_PAGES_PER_QUEUE = 2;
const MATCH_DETAILS_PER_RUN = 100;
const RANKED_QUEUES = [440, 420] as const;

interface RiotClient {
	getFlexMatchIds(puuid: string, options: FlexMatchIdsOptions): Promise<string[]>;
	getRankedMatchIds?(puuid: string, options: FlexMatchIdsOptions): Promise<string[]>;
	getMatch(id: string): Promise<MatchDto>;
	getRankEntries?(puuid: string): Promise<LeagueEntryDto[]>;
	getTimeline?(id: string): Promise<unknown | null>;
}

interface BackfillCursor {
	nextStart: number;
	isComplete: number;
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function deferMatch(database: Database.Database, id: string, error: unknown): void {
	const row = database.prepare('SELECT attempts FROM ingest_pending WHERE match_id = ?')
		.get(id) as { attempts: number } | undefined;
	if (!row) return;
	const delay = deferredRetryDelay(error, row.attempts);
	database.prepare('UPDATE ingest_pending SET attempts = attempts + 1, next_attempt_at = ? WHERE match_id = ?')
		.run(Date.now() + delay, id);
}

export async function ingest(database: Database.Database, client: RiotClient, backfill = false, options: {
	deadlineAt?: number;
	onProgress?: (message: string) => void;
} = {}) {
	const startedAt = Date.now();
	const progress = options.onProgress ?? (() => {});
	const capturedOn = new Date(startedAt).toISOString().slice(0, 10);
	let newMatches = 0;
	let pendingRemaining = 0;
	const importedByQueue = { 420: 0, 440: 0 };
	let existingMatches = 0;
	let repairedMatches = 0;
	let budgetExhausted = false;
	let timelinesCollected = 0;
	let timelinesUnavailable = 0;
	const withinBudget = () => {
		if (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt) {
			budgetExhausted = true;
			return false;
		}
		return true;
	};
	const failures: string[] = [];
	const players = database.prepare('SELECT puuid, game_name AS name FROM players').all() as { puuid: string; name: string | null }[];
	const roster = new Set(players.map((player) => player.puuid));
	const supportsSoloDuo = Boolean(client.getRankedMatchIds);

	try {
		if (!roster.size) throw new Error('No players in DB; run npm run sync -- setup first');
		progress(`Collecte : ${players.length} joueurs · files ${supportsSoloDuo ? '440 (Flex), 420 (Solo/Duo)' : '440 (Flex)'} · mode ${backfill ? 'historique' : 'incrémental'}`);
		const enqueue = database.prepare('INSERT OR IGNORE INTO ingest_pending (match_id) VALUES (?)');
		database.prepare(`INSERT OR IGNORE INTO ingest_pending (match_id)
			SELECT m.match_id FROM matches AS m
			WHERE m.match_kind != 'collision' AND (
				m.raw_json IS NULL OR NOT EXISTS (SELECT 1 FROM participants AS p WHERE p.match_id = m.match_id)
				OR EXISTS (SELECT 1 FROM participants AS p WHERE p.match_id = m.match_id
					AND (p.lineup_size IS NULL OR p.lineup_size !=
						(SELECT COUNT(*) FROM participants AS candidate WHERE candidate.match_id = m.match_id))))`).run();

		collection: for (const { puuid, name } of players) {
			for (const queue of RANKED_QUEUES) {
				if (!withinBudget()) break collection;
				if (queue === 420 && !supportsSoloDuo) continue;
				try {
					const context = `Collecte ${name ?? puuid} · queue=${queue}`;
					const listIds = queue === 420 ? client.getRankedMatchIds! : client.getFlexMatchIds;
					if (backfill) {
						const cursor = database.prepare(`SELECT next_start AS nextStart, is_complete AS isComplete
							FROM ingest_backfill_cursors WHERE puuid = ? AND queue_id = ?`)
							.get(puuid, queue) as BackfillCursor | undefined;
						if (cursor?.isComplete) {
							progress(`${context} : déjà terminée`);
							continue;
						}
						let nextStart = cursor?.nextStart ?? 0;
						const seen = new Set<string>();

						for (let page = 0; page < BACKFILL_PAGES_PER_QUEUE; page += 1) {
							if (!withinBudget()) break collection;
							progress(`${context} : start=${nextStart} · count=${MATCH_PAGE_SIZE}`);
							const ids = await listIds(puuid, { start: nextStart, count: MATCH_PAGE_SIZE, queue });
							if (ids.length && ids.every((id) => seen.has(id))) {
								throw new Error('Riot pagination made no progress');
							}
							const pageStart = nextStart;
							const isComplete = ids.length < MATCH_PAGE_SIZE;
							nextStart += ids.length;
							database.transaction(() => {
								for (const id of ids) {
									enqueue.run(id);
									seen.add(id);
								}
								database.prepare(`INSERT INTO ingest_backfill_cursors
									(puuid, queue_id, next_start, is_complete, updated_at) VALUES (?, ?, ?, ?, ?)
									ON CONFLICT(puuid, queue_id) DO UPDATE SET
										next_start = excluded.next_start,
										is_complete = excluded.is_complete,
										updated_at = excluded.updated_at`)
									.run(puuid, queue, nextStart, Number(isComplete), Date.now());
							})();
							progress(`${context} : ${ids.length} IDs reçus · prochain offset=${nextStart} · terminée=${isComplete}`);
							if (isComplete || nextStart <= pageStart) break;
						}
					} else {
						let startTime: number | undefined;
						if (queue === 440) {
							const cursor = database.prepare('SELECT start_time AS startTime FROM ingest_cursors WHERE puuid = ?')
								.get(puuid) as { startTime: number } | undefined;
							startTime = cursor?.startTime ?? Math.max(0, Math.floor(startedAt / 1000) - 24 * 60 * 60);
						} else {
							const cursor = database.prepare(`SELECT start_time AS startTime FROM individual_ingest_cursors
								WHERE puuid = ? AND queue_id = 420`).get(puuid) as { startTime: number } | undefined;
							startTime = cursor?.startTime ?? Math.max(0, Math.floor(startedAt / 1000) - 24 * 60 * 60);
						}

						const seen = new Set<string>();
						for (let start = 0; ; start += MATCH_PAGE_SIZE) {
							if (!withinBudget()) break collection;
							progress(`${context} : start=${start} · count=${MATCH_PAGE_SIZE} · startTime=${startTime}`);
							const ids = await listIds(puuid, { start, count: MATCH_PAGE_SIZE, startTime, queue });
							if (ids.length && ids.every((id) => seen.has(id))) {
								throw new Error('Riot pagination made no progress');
							}
							database.transaction(() => {
								for (const id of ids) {
									enqueue.run(id);
									seen.add(id);
								}
							})();
							progress(`${context} : ${ids.length} IDs reçus et mis en file (doublons ignorés)`);
							if (ids.length < MATCH_PAGE_SIZE) break;
						}

						const overlapCursor = Math.max(0, Math.floor(startedAt / 1000) - 24 * 60 * 60);
						if (queue === 440) {
							database.prepare(`INSERT INTO ingest_cursors (puuid, start_time) VALUES (?, ?)
								ON CONFLICT(puuid) DO UPDATE SET start_time = excluded.start_time`).run(puuid, overlapCursor);
						} else {
							database.prepare(`INSERT INTO individual_ingest_cursors (puuid, queue_id, start_time) VALUES (?, 420, ?)
								ON CONFLICT(puuid, queue_id) DO UPDATE SET start_time = excluded.start_time`)
								.run(puuid, overlapCursor);
						}
					}
				} catch (error) {
					const queueName = queue === 420 ? 'Solo/Duo collection' : 'Flex collection';
					const message = `${queueName} ${puuid}: ${messageOf(error)}`;
					failures.push(message);
					progress(`Échec : ${message}`);
					if (error instanceof RateLimitError) throw new Error(message);
				}
			}
		}

		const pending = database.prepare(`SELECT match_id FROM ingest_pending
			WHERE next_attempt_at <= ? ORDER BY next_attempt_at, rowid LIMIT ?`)
			.all(startedAt, MATCH_DETAILS_PER_RUN) as { match_id: string }[];
		const remove = database.prepare('DELETE FROM ingest_pending WHERE match_id = ?');
		progress(`Détails : ${pending.length} matchs prêts sélectionnés · limite=${MATCH_DETAILS_PER_RUN}`);
		let processed = 0;
		for (const { match_id: id } of pending) {
			if (!withinBudget()) break;
			progress(`Détails ${++processed}/${pending.length} : ${id}`);
			try {
				const existing = database.prepare(`SELECT raw_json AS rawJson, game_start_ts AS startedAt, duration_s AS durationS,
					queue_id AS queueId,
					match_kind AS matchKind
					FROM matches WHERE match_id = ?`).get(id) as {
						rawJson: string | null; startedAt: number | null; durationS: number | null; queueId: number | null;
						matchKind: 'team' | 'collision';
					} | undefined;
				if (existing) {
					if (existing.matchKind === 'collision') {
						if (existing.rawJson === null || existing.startedAt === null || existing.durationS === null) {
							throw new Error(`Incomplete collision data for ${id}`);
						}
						const storedMatch = validateMatch(JSON.parse(existing.rawJson), id);
						if (storedMatch.info.gameCreation !== existing.startedAt || storedMatch.info.gameDuration !== existing.durationS ||
							storedMatch.info.queueId !== existing.queueId ||
							(storedMatch.info.queueId !== 420 && storedMatch.info.queueId !== 440)) {
							throw new Error(`Inconsistent collision data for ${id}`);
						}
						database.transaction(() => {
							database.prepare('DELETE FROM match_timelines WHERE match_id = ?').run(id);
							database.prepare('DELETE FROM participants WHERE match_id = ?').run(id);
							remove.run(id);
						})();
						existingMatches += 1;
						progress(`${id} : collision stellaire déjà enregistrée`);
						continue;
					}
					try {
						if (existing.rawJson === null || existing.startedAt === null || existing.durationS === null) throw new Error('Missing raw data');
						validatedLineup(database, id, existing.rawJson, existing.startedAt, existing.durationS);
						remove.run(id);
						existingMatches += 1;
						progress(`${id} : déjà présent et valide`);
						continue;
					} catch {
						// Legacy non-atomic ingestion may have left an incomplete row. Refetch before replacing it.
					}
				}
				if (!withinBudget()) break;
				const match = validateMatch(await client.getMatch(id), id);
				const { info } = match;
				const ours = info.participants.filter((participant) => roster.has(participant.puuid));
				if ((info.queueId !== 440 && info.queueId !== 420) || !ours.length) {
					if (existing) throw new Error('Cannot repair existing match without a flex roster lineup');
					remove.run(id);
					progress(`${id} : hors périmètre, retiré de la file`);
					continue;
				}
				const collision = ours.some((participant) => participant.teamId !== ours[0].teamId);
				database.transaction(() => {
					if (existing) {
						database.prepare('DELETE FROM match_timelines WHERE match_id = ?').run(id);
						database.prepare('DELETE FROM participants WHERE match_id = ?').run(id);
						database.prepare('DELETE FROM matches WHERE match_id = ?').run(id);
					}
					database.prepare(`INSERT INTO matches
						(match_id, game_start_ts, duration_s, queue_id, raw_json, match_kind) VALUES (?,?,?,?,?,?)`)
						.run(id, info.gameCreation, info.gameDuration, info.queueId, JSON.stringify(match), collision ? 'collision' : 'team');
					const insert = database.prepare(`INSERT INTO participants
						(match_id, puuid, champion, role, kills, deaths, assists, win, lineup_size) VALUES (?,?,?,?,?,?,?,?,?)`);
					const rename = database.prepare('UPDATE players SET game_name = ?, tag_line = ? WHERE puuid = ?');
					for (const participant of ours) {
						if (!collision) {
							insert.run(id, participant.puuid, participant.championName, participant.individualPosition,
								participant.kills, participant.deaths, participant.assists, Number(participant.win), ours.length);
						}
						rename.run(participant.riotIdGameName, participant.riotIdTagline, participant.puuid);
					}
					remove.run(id);
				})();
				if (existing) repairedMatches += 1;
				else if (info.queueId === 440 || info.queueId === 420) importedByQueue[info.queueId] += 1;
				if (!collision && !existing && info.queueId === 440 && ours.length === 5) newMatches += 1;
				progress(`${id} : ${collision ? 'collision stellaire enregistrée' : existing ? 'réparé' : 'importé'} · queue=${info.queueId} · joueurs=${ours.length}`);
			} catch (error) {
				const message = `Match ${id}: ${messageOf(error)}`;
				deferMatch(database, id, error);
				failures.push(message);
				progress(`Échec différé : ${message}`);
				if (error instanceof RateLimitError) throw new Error(message);
			}
		}

		if (client.getRankEntries) {
			progress(`Rangs : ${players.length} joueurs · date=${capturedOn}`);
			for (const { puuid } of players) {
				if (!withinBudget()) break;
				const alreadyCaptured = database.prepare('SELECT 1 FROM rank_snapshots WHERE puuid = ? AND captured_on = ? LIMIT 1')
					.get(puuid, capturedOn);
				if (alreadyCaptured) {
					progress(`Rangs ${puuid} : déjà enregistrés aujourd’hui`);
					continue;
				}
				try {
					if (!withinBudget()) break;
					progress(`Rangs ${puuid} : récupération`);
					const entries = await client.getRankEntries(puuid);
					const byQueue = new Map(entries.map((entry) => [entry.queueType, entry]));
					database.transaction(() => {
						const insert = database.prepare(`INSERT OR IGNORE INTO rank_snapshots
							(puuid, queue_type, captured_on, tier, division, league_points, wins, losses)
							VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
						for (const queueType of ['RANKED_SOLO_5x5', 'RANKED_FLEX_SR'] as const) {
							const entry = byQueue.get(queueType);
							insert.run(puuid, queueType, capturedOn, entry?.tier ?? null, entry?.rank ?? null,
								entry?.leaguePoints ?? null, entry?.wins ?? null, entry?.losses ?? null);
						}
					})();
					progress(`Rangs ${puuid} : enregistrés · ${entries.length} entrées Riot`);
				} catch (error) {
					const message = `Rank snapshot ${puuid}: ${messageOf(error)}`;
					failures.push(message);
					progress(`Échec : ${message}`);
					if (error instanceof RateLimitError) break;
				}
			}
		}
		if (client.getTimeline && !failures.length) {
			const timelines = await collectTimelines(database, client.getTimeline, withinBudget, progress);
			timelinesCollected = timelines.collected;
			timelinesUnavailable = timelines.unavailable;
			failures.push(...timelines.failures);
		}
	} catch (error) {
		if (!failures.some((failure) => failure.includes(messageOf(error)))) failures.push(messageOf(error));
	} finally {
		pendingRemaining = (database.prepare('SELECT COUNT(*) AS count FROM ingest_pending').get() as { count: number }).count;
	}

	database.prepare('INSERT INTO ingest_runs (started_at, finished_at, new_matches, status) VALUES (?, ?, ?, ?)')
		.run(startedAt, Date.now(), newMatches, failures.length ? 'failed' : 'ok');
	progress(`Lot enregistré : ${failures.length ? 'échec' : 'ok'} · budget épuisé=${budgetExhausted} · ${pendingRemaining} matchs en attente · durée=${((Date.now() - startedAt) / 1000).toFixed(1)} s`);
	return { newMatches, failures, pendingRemaining, importedByQueue, existingMatches, repairedMatches, budgetExhausted,
		timelinesCollected, timelinesUnavailable };
}
