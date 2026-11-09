import type Database from 'better-sqlite3';
import { deferredRetryDelay, HttpError, RateLimitError } from '../lib/backendHttp';
import { extractTimeline } from '../lib/timeline';
import { getMatches } from '../lib/stats/matches';
import { parsedMatch, validatedLineup } from '../lib/stats/shared';

export const TIMELINES_PER_RUN = 10;

export async function collectTimelines(
	database: Database.Database,
	getTimeline: (id: string) => Promise<unknown | null>,
	withinBudget: () => boolean,
) {
	const enqueue = database.prepare(`INSERT OR IGNORE INTO match_timelines (match_id, updated_at) VALUES (?, ?)`);
	database.transaction(() => {
		for (const match of getMatches(database)) enqueue.run(match.id, Date.now());
	})();
	const pending = database.prepare(`SELECT t.match_id AS id, t.attempts, m.raw_json AS rawJson,
		m.game_start_ts AS startedAt, m.duration_s AS durationS
		FROM match_timelines AS t JOIN matches AS m ON m.match_id = t.match_id
		WHERE t.status = 'pending' AND t.next_attempt_at <= ?
		ORDER BY t.next_attempt_at, m.game_start_ts DESC, t.match_id LIMIT ?`)
		.all(Date.now(), TIMELINES_PER_RUN) as {
			id: string; attempts: number; rawJson: string; startedAt: number; durationS: number;
		}[];
	let collected = 0;
	let unavailable = 0;
	const failures: string[] = [];
	for (const row of pending) {
		if (!withinBudget()) break;
		try {
			const { info, teamId, members } = validatedLineup(database, row.id, row.rawJson, row.startedAt, row.durationS);
			if (info.queueId !== 440 || members.length !== 5) throw new Error('Timeline is not a full-team Flex match');
			const raw = await getTimeline(row.id);
			const summary = raw === null ? null : extractTimeline(raw, parsedMatch(row.rawJson), teamId);
			database.prepare(`UPDATE match_timelines SET status = ?, summary_json = ?, last_error = NULL,
				next_attempt_at = 0, updated_at = ? WHERE match_id = ?`)
				.run(summary ? 'ready' : 'unavailable', summary ? JSON.stringify(summary) : null, Date.now(), row.id);
			if (summary) collected += 1;
			else unavailable += 1;
		} catch (error) {
			const message = `Timeline ${row.id}: ${error instanceof Error ? error.message : String(error)}`;
			const delay = deferredRetryDelay(error, row.attempts);
			database.prepare(`UPDATE match_timelines SET attempts = attempts + 1, next_attempt_at = ?,
				last_error = ?, updated_at = ? WHERE match_id = ?`).run(Date.now() + delay, message, Date.now(), row.id);
			failures.push(message);
			if (error instanceof RateLimitError || (error instanceof HttpError && [401, 403].includes(error.status))) break;
		}
	}
	return { collected, unavailable, failures };
}
