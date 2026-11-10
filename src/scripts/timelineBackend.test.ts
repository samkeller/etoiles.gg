import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpError, RateLimitError } from '../lib/backendHttp';
import { addMatch, addPlayer, closeTestDatabases, createTestDatabase, fullLineup, timelineFixture } from '../lib/stats/fixtures';
import type { MatchDto } from '../lib/types';
import { getTeamStories } from '../lib/stats/moments';
import { collectTimelines, TIMELINES_PER_RUN } from './timelineBackend';
import { readSyncStatus, runHistory } from './syncBackend';
import { getMatchTimeline } from '../lib/stats/timelines';
import { extractTimeline } from '../lib/timeline';

afterEach(() => { closeTestDatabases(); vi.useRealTimers(); });
function fixture(count = 1) {
	const db = createTestDatabase();
	for (const member of fullLineup()) addPlayer(db, member.puuid, member.puuid);
	for (let i = 1; i <= count; i++) addMatch(db, { id: `EUW1_${i}`, startedAt: i, won: true, members: fullLineup() });
	const raw = (id: string): MatchDto => JSON.parse((db.prepare('SELECT raw_json AS json FROM matches WHERE match_id = ?').get(id) as { json: string }).json);
	return { db, raw };
}

describe('resumable timeline collection', () => {
	it('collects only complete Flex, stores no raw payload and is bounded, idempotent and cache-aware', async () => {
		const { db, raw } = fixture(TIMELINES_PER_RUN + 1);
		addMatch(db, { id: 'EUW1_50', startedAt: 50, won: true, members: fullLineup().slice(0, 3) });
		addMatch(db, { id: 'EUW1_51', startedAt: 51, won: true, members: fullLineup(), queueId: 420 });
		const get = vi.fn(async (id: string) => timelineFixture(raw(id)));
		expect(getTeamStories(db).timelineCoverage).toBe(0);
		expect(await collectTimelines(db, get, () => true)).toEqual({ collected: 10, unavailable: 0, failures: [] });
		expect(get).toHaveBeenCalledTimes(10);
		expect(getTeamStories(db).timelineCoverage).toBe(10);
		expect(getTeamStories(db).events.filter((event) => event.kind === 'comeback')).toHaveLength(10);
		expect(await collectTimelines(db, get, () => true)).toMatchObject({ collected: 1 });
		expect(await collectTimelines(db, get, () => true)).toMatchObject({ collected: 0 });
		expect(get).toHaveBeenCalledTimes(11);
		expect(db.prepare('SELECT COUNT(*) AS count FROM match_timelines').get()).toEqual({ count: 11 });
		const row = db.prepare('SELECT summary_json AS json FROM match_timelines LIMIT 1').get() as { json: string };
		expect(row.json.length).toBeLessThan(600);
	});

	it('leaves interrupted work pending and honors the scheduling budget before HTTP', async () => {
		const { db, raw } = fixture(3);
		let budget = true;
		const get = vi.fn(async (id: string) => { budget = false; return timelineFixture(raw(id)); });
		expect(await collectTimelines(db, get, () => budget)).toMatchObject({ collected: 1, failures: [] });
		expect(get).toHaveBeenCalledTimes(1);
		expect(db.prepare("SELECT COUNT(*) AS count FROM match_timelines WHERE status = 'pending'").get()).toEqual({ count: 2 });
		expect(await collectTimelines(db, async (id) => timelineFixture(raw(id)), () => true)).toMatchObject({ collected: 2 });
	});

	it('records missing timelines as unavailable but defers failures with a visible error and exponential backoff', async () => {
		vi.useFakeTimers(); vi.setSystemTime(1000);
		const { db } = fixture(2);
		const get = vi.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('HTTP 503'));
		const result = await collectTimelines(db, get, () => true);
		expect(result).toMatchObject({ collected: 0, unavailable: 1, failures: ['Timeline EUW1_1: HTTP 503'] });
		expect(await collectTimelines(db, get, () => true)).toMatchObject({ failures: [] });
		expect(get).toHaveBeenCalledTimes(2);
		expect(db.prepare("SELECT attempts, next_attempt_at, last_error FROM match_timelines WHERE status = 'pending'").get())
			.toEqual({ attempts: 1, next_attempt_at: 61000, last_error: 'Timeline EUW1_1: HTTP 503' });
		vi.setSystemTime(61000);
		get.mockRejectedValueOnce(new Error('still unavailable'));
		await collectTimelines(db, get, () => true);
		expect(db.prepare("SELECT attempts, next_attempt_at FROM match_timelines WHERE status = 'pending'").get())
			.toEqual({ attempts: 2, next_attempt_at: 181000 });
	});

	it('stops immediately on a rate limit and does not erase pending work', async () => {
		const { db } = fixture(3);
		const get = vi.fn().mockRejectedValue(new RateLimitError('HTTP 429'));
		expect((await collectTimelines(db, get, () => true)).failures).toHaveLength(1);
		expect(get).toHaveBeenCalledTimes(1);
		expect(db.prepare("SELECT COUNT(*) AS count FROM match_timelines WHERE status = 'pending'").get()).toEqual({ count: 3 });
	});

	it('never schedules a durable retry earlier than a long Riot Retry-After', async () => {
		vi.useFakeTimers(); vi.setSystemTime(1000);
		const { db } = fixture();
		await collectTimelines(db, async () => { throw new RateLimitError('HTTP 429', 86400000); }, () => true);
		expect(db.prepare('SELECT next_attempt_at FROM match_timelines').get()).toEqual({ next_attempt_at: 86401000 });
	});

	it('does not accept corrupt payloads or turn an incomplete lineup into statistics', async () => {
		const { db } = fixture();
		expect((await collectTimelines(db, async () => ({}), () => true)).failures[0]).toContain('Invalid Riot timeline');
		expect(getTeamStories(db).timelineCoverage).toBe(0);
		db.exec("UPDATE participants SET lineup_size = 4");
		await expect(collectTimelines(db, async () => null, () => true)).rejects.toThrow('Inconsistent');
	});

	it('reports authentication failure in the sync run without sending requests for every queued timeline', async () => {
		const { db } = fixture(3);
		const getTimeline = vi.fn().mockRejectedValue(new HttpError(403, 'HTTP 403'));
		const result = await runHistory(db, {
			getFlexMatchIds: vi.fn().mockResolvedValue([]), getMatch: vi.fn(), getTimeline,
		}, 60);
		expect(result).toMatchObject({ batches: 1, failures: 1, stopReason: 'failed' });
		expect(getTimeline).toHaveBeenCalledTimes(1);
		expect(db.prepare('SELECT status FROM ingest_runs ORDER BY rowid DESC LIMIT 1').get()).toEqual({ status: 'failed' });
		expect(result.status.timelines).toMatchObject({ pending: 3, collected: 0 });
	});

	it('includes timeline work in multi-batch history completion and its summary', async () => {
		const { db, raw } = fixture(11);
		const result = await runHistory(db, {
			getFlexMatchIds: vi.fn().mockResolvedValue([]), getMatch: vi.fn(),
			getTimeline: async (id) => timelineFixture(raw(id)),
		}, 60);
		expect(result).toMatchObject({ batches: 2, stopReason: 'complete', failures: 0 });
		expect(result.status.timelines).toMatchObject({ pending: 0, collected: 11 });
	});

	it('refreshes legacy summaries within the same bounded queue while keeping them readable through failures', async () => {
		vi.useFakeTimers(); vi.setSystemTime(1000);
		const { db, raw } = fixture();
		const { kills: _kills, ...summary } = extractTimeline(timelineFixture(raw('EUW1_1')), raw('EUW1_1'), 100);
		db.prepare("INSERT INTO match_timelines (match_id, status, summary_json, updated_at) VALUES (?, 'ready', ?, 0)")
			.run('EUW1_1', JSON.stringify({ ...summary, version: 1 }));
		expect(readSyncStatus(db).timelines).toMatchObject({ collected: 1, pending: 1, ready: 1 });
		expect(getMatchTimeline(db, 'EUW1_1').summary?.kills).toBeNull();
		const get = vi.fn().mockRejectedValueOnce(new Error('HTTP 503'));
		expect((await collectTimelines(db, get, () => true)).failures).toHaveLength(1);
		expect(getMatchTimeline(db, 'EUW1_1').status).toBe('ready');
		expect(readSyncStatus(db).timelines).toMatchObject({ collected: 1, pending: 1, ready: 0, nextRetryAt: 61000 });
		await collectTimelines(db, get, () => true);
		expect(get).toHaveBeenCalledTimes(1);
		vi.setSystemTime(61000);
		get.mockResolvedValueOnce(timelineFixture(raw('EUW1_1')));
		expect(await collectTimelines(db, get, () => true)).toEqual({ collected: 1, unavailable: 0, failures: [] });
		expect(getMatchTimeline(db, 'EUW1_1').summary?.kills).toEqual([]);
		expect(readSyncStatus(db).timelines).toMatchObject({ collected: 1, pending: 0, ready: 0 });
		await collectTimelines(db, get, () => true);
		expect(get).toHaveBeenCalledTimes(2);
	});

	it('preserves legacy gold and objectives when Riot no longer provides the timeline and does not retry forever', async () => {
		const { db, raw } = fixture();
		const { kills: _kills, ...summary } = extractTimeline(timelineFixture(raw('EUW1_1')), raw('EUW1_1'), 100);
		db.prepare("INSERT INTO match_timelines (match_id, status, summary_json, updated_at) VALUES (?, 'ready', ?, 0)")
			.run('EUW1_1', JSON.stringify({ ...summary, version: 1 }));
		const get = vi.fn().mockResolvedValue(null);
		expect(await collectTimelines(db, get, () => true)).toEqual({ collected: 0, unavailable: 1, failures: [] });
		expect(getMatchTimeline(db, 'EUW1_1')).toEqual({
			status: 'ready', summary: { ...summary, version: 2, kills: null },
		});
		expect(readSyncStatus(db).timelines).toMatchObject({ collected: 1, pending: 0 });
		await collectTimelines(db, get, () => true);
		expect(get).toHaveBeenCalledTimes(1);
	});
});
