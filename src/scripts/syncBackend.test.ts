import { afterEach, describe, expect, it, vi } from 'vitest';
import { addMatch, addPlayer, closeTestDatabases, createTestDatabase, fullLineup } from '../lib/stats/fixtures';
import type { MatchDto } from '../lib/types';
import { RateLimitError } from '../lib/backendHttp';
import { ingest } from './ingestBackend';
import {
	formatIngestSummary, formatSyncStatus, parseSyncArgs, readSyncStatus, resolveRiotIds,
	runHistory, setupPlayers,
} from './syncBackend';

afterEach(() => { vi.useRealTimers(); closeTestDatabases(); });

function match(id: string, queue = 440): MatchDto {
	const fixture = createTestDatabase();
	addMatch(fixture, { id, startedAt: 100, won: true, members: fullLineup() });
	const result = JSON.parse((fixture.prepare('SELECT raw_json FROM matches').get() as { raw_json: string }).raw_json) as MatchDto;
	result.info.queueId = queue;
	return result;
}

describe('sync argument validation', () => {
	it('accepts commands, help, and seconds while defaulting history to a single batch', () => {
		expect(parseSyncArgs([])).toEqual({ command: 'help' });
		expect(parseSyncArgs(['--help'])).toEqual({ command: 'help' });
		expect(parseSyncArgs(['history', '--help'])).toEqual({ command: 'help' });
		expect(parseSyncArgs(['update'])).toEqual({ command: 'update' });
		expect(parseSyncArgs(['status'])).toEqual({ command: 'status' });
		expect(parseSyncArgs(['history'])).toEqual({ command: 'history' });
		expect(parseSyncArgs(['history', '--max-duration', '0.5'])).toEqual({ command: 'history', maxDurationSeconds: 0.5 });
		expect(parseSyncArgs(['history', '--max-duration', '86400'])).toEqual({ command: 'history', maxDurationSeconds: 86400 });
		expect(parseSyncArgs(['history', '--since', '2026-11-07'])).toEqual({ command: 'history', since: '2026-11-07' });
		expect(parseSyncArgs(['history', '--since', '2026-11-07', '--max-duration', '120']))
			.toEqual({ command: 'history', since: '2026-11-07', maxDurationSeconds: 120 });
		expect(parseSyncArgs(['history', '--max-duration', '120', '--since', '2026-11-07']))
			.toEqual({ command: 'history', since: '2026-11-07', maxDurationSeconds: 120 });
	});

	it.each([
		['wat'], ['update', 'extra'], ['status', '--force'], ['setup', '--force'],
		['history', '--max-duration'], ['history', '--max-duration', '0'],
		['history', '--max-duration', '-1'], ['history', '--max-duration', 'NaN'],
		['history', '--max-duration', 'Infinity'], ['history', '--max-duration', '86401'],
		['history', '--max-duration', '1s'], ['history', '--max-duration', ''],
		['history', '--max-duration', '1', '--max-duration', '2'],
		['history', '--loop'], ['help', 'extra'],
		['history', '--since'], ['history', '--since', '2026-02-30'],
		['history', '--since', '2025-02-29'], ['history', '--since', '2026-13-01'],
		['history', '--since', '2026-11-00'], ['history', '--since', '2026-11-07T00:00:00Z'],
		['history', '--since', '1969-12-31'], ['history', '--since', '9999-01-01'],
		['history', '--since', '2026-11-07', '--since', '2026-11-08'],
	])('rejects invalid arguments %j', (...args) => {
		expect(() => parseSyncArgs(args)).toThrow();
	});

	it('prefers explicit IDs over PLAYERS and normalizes every ID before setup', () => {
		expect(parseSyncArgs(['setup', ' New Name # EUW ', 'Other#TAG'], 'invalid')).toEqual({
			command: 'setup', riotIds: ['New Name#EUW', 'Other#TAG'],
		});
		expect(resolveRiotIds([], ' First#EUW ,Second # TAG ')).toEqual(['First#EUW', 'Second#TAG']);
	});

	it.each([undefined, '', ' ', 'Name#TAG,', 'Name', '#TAG', 'Name#', 'Name#TAG#extra', 'Name/Bad#TAG', 'Name#T\\AG'])(
		'rejects invalid or missing PLAYERS %s', (players) => {
			expect(() => resolveRiotIds([], players)).toThrow();
		},
	);
});

describe('setup', () => {
	it('validates the entire roster before calling Riot or writing and validates returned PUUIDs', async () => {
		const database = createTestDatabase();
		const client = { getPuuid: vi.fn().mockResolvedValue('puuid') };
		await expect(setupPlayers(database, ['Valid#TAG', 'invalid'], client)).rejects.toThrow('Invalid Riot ID');
		expect(client.getPuuid).not.toHaveBeenCalled();
		client.getPuuid.mockResolvedValue('');
		await expect(setupPlayers(database, ['Valid#TAG'], client)).rejects.toThrow('Invalid Riot account PUUID');
		expect(database.prepare('SELECT * FROM players').all()).toEqual([]);
	});

	it('upserts resolved identities while preserving players not supplied', async () => {
		const database = createTestDatabase();
		addPlayer(database, 'keep', 'Keep');
		addPlayer(database, 'rename', 'Old');
		const client = { getPuuid: vi.fn().mockResolvedValueOnce('rename').mockResolvedValueOnce('new') };
		expect(await setupPlayers(database, [' New Name #TAG ', 'Second#EUW'], client)).toBe(2);
		expect(client.getPuuid.mock.calls).toEqual([['New Name#TAG'], ['Second#EUW']]);
		expect(database.prepare('SELECT puuid, game_name FROM players ORDER BY puuid').all()).toEqual([
			{ puuid: 'keep', game_name: 'Keep' }, { puuid: 'new', game_name: 'Second' }, { puuid: 'rename', game_name: 'New Name' },
		]);
	});

	it('reports partial setup and stops on a rate limit without resolving the remaining IDs', async () => {
		const database = createTestDatabase();
		const client = { getPuuid: vi.fn().mockResolvedValueOnce('first').mockRejectedValueOnce(new RateLimitError('HTTP 429')) };
		await expect(setupPlayers(database, ['First#TAG', 'Second#TAG', 'Third#TAG'], client))
			.rejects.toThrow('Setup Second#TAG (1/3 enregistrés): HTTP 429');
		expect(client.getPuuid).toHaveBeenCalledTimes(2);
		expect(database.prepare('SELECT COUNT(*) AS count FROM players').get()).toEqual({ count: 1 });
	});
});

describe('history and summaries', () => {
	it('rescans both queues despite completed history and preserves all cursors and existing rows', async () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Player');
		addMatch(database, { id: 'EUW1_1', startedAt: 100, won: true, members: fullLineup().slice(0, 1) });
		database.exec(`INSERT INTO ingest_backfill_cursors VALUES ('player-0', 440, 500, 1, 123);
			INSERT INTO ingest_backfill_cursors VALUES ('player-0', 420, 300, 1, 123);
			INSERT INTO ingest_cursors VALUES ('player-0', 999999);
			INSERT INTO individual_ingest_cursors VALUES ('player-0', 420, 999999)`);
		const tables = ['ingest_backfill_cursors', 'ingest_cursors', 'individual_ingest_cursors'];
		const before = tables.map((table) => database.prepare(`SELECT * FROM ${table}`).all());
		const existing = database.prepare("SELECT * FROM matches WHERE match_id = 'EUW1_1'").get();
		const page = Array.from({ length: 100 }, (_, i) => `EUW1_${i + 1}`);
		const client = {
			getFlexMatchIds: vi.fn().mockResolvedValueOnce(page).mockResolvedValueOnce(['EUW1_101']),
			getRankedMatchIds: vi.fn().mockResolvedValue(['EUW1_420']),
			getMatch: vi.fn(async (id: string) => match(id, id === 'EUW1_420' ? 420 : 440)),
		};
		const result = await runHistory(database, client, 120, () => {}, () => {}, '2026-11-07');
		expect(result).toMatchObject({ batches: 2, failures: 0, stopReason: 'complete' });
		const startTime = Date.parse('2026-11-07T00:00:00Z') / 1000;
		expect(client.getFlexMatchIds.mock.calls).toEqual([
			['player-0', { start: 0, count: 100, startTime, queue: 440 }],
			['player-0', { start: 100, count: 100, startTime, queue: 440 }],
		]);
		expect(client.getRankedMatchIds).toHaveBeenCalledExactlyOnceWith('player-0', { start: 0, count: 100, startTime, queue: 420 });
		expect(client.getMatch).not.toHaveBeenCalledWith('EUW1_1');
		expect(database.prepare("SELECT * FROM matches WHERE match_id = 'EUW1_1'").get()).toEqual(existing);
		expect(database.prepare('SELECT COUNT(*) AS count FROM matches').get()).toEqual({ count: 102 });
		for (const [index, table] of tables.entries()) expect(database.prepare(`SELECT * FROM ${table}`).all()).toEqual(before[index]);
		expect(formatSyncStatus(result.status, '2026-11-07').join('\n')).toContain('Rattrapage terminé');
	});

	it('persists collected IDs at a budget interruption and rescans safely on relaunch', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-11-11T12:00:00Z'));
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Player');
		const page = Array.from({ length: 100 }, (_, i) => `EUW1_${i}`);
		const client = {
			getFlexMatchIds: vi.fn().mockImplementationOnce(async () => {
				vi.setSystemTime(new Date('2026-11-11T12:00:02Z'));
				return page;
			}),
			getMatch: vi.fn(async (id: string) => match(id)),
		};
		const first = await runHistory(database, client, 1, () => {}, () => {}, '2026-11-07');
		expect(first).toMatchObject({ stopReason: 'budget', status: { collectionComplete: false, pendingRemaining: 100 } });
		expect(client.getMatch).not.toHaveBeenCalled();
		expect(database.prepare('SELECT * FROM ingest_backfill_cursors').all()).toEqual([]);
		client.getFlexMatchIds.mockResolvedValueOnce(page).mockResolvedValueOnce([]);
		const resumed = await runHistory(database, client, 120, () => {}, () => {}, '2026-11-07');
		expect(resumed).toMatchObject({ stopReason: 'complete', failures: 0 });
		expect(client.getFlexMatchIds.mock.calls.map((call) => call[1].start)).toEqual([0, 0, 100]);
		expect(database.prepare('SELECT COUNT(*) AS count FROM matches').get()).toEqual({ count: 100 });
	});

	it('does not bypass deferred retries during a dated rescan', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-11-11T12:00:00Z'));
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Player');
		const nextRetry = Date.now() + 60000;
		database.prepare('INSERT INTO ingest_pending VALUES (?, 3, ?)').run('EUW1_1', nextRetry);
		const client = { getFlexMatchIds: vi.fn().mockResolvedValue(['EUW1_1']), getMatch: vi.fn() };
		const result = await runHistory(database, client, 120, () => {}, () => {}, '2026-11-07');
		expect(result).toMatchObject({ stopReason: 'deferred', failures: 0, status: { nextRetryAt: nextRetry } });
		expect(database.prepare('SELECT * FROM ingest_pending').get()).toEqual({
			match_id: 'EUW1_1', attempts: 3, next_attempt_at: nextRetry,
		});
		expect(client.getMatch).not.toHaveBeenCalled();
	});

	it('stops a dated rescan on rate limits without declaring collection complete', async () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Player');
		const client = { getFlexMatchIds: vi.fn().mockRejectedValue(new RateLimitError('HTTP 429')), getMatch: vi.fn() };
		expect(await runHistory(database, client, 120, () => {}, () => {}, '2026-11-07'))
			.toMatchObject({ stopReason: 'failed', failures: 1, status: { collectionComplete: false } });
		expect(client.getFlexMatchIds).toHaveBeenCalledTimes(1);
		expect(client.getMatch).not.toHaveBeenCalled();
	});

	it('does not report dated catch-up as complete with an empty roster', async () => {
		const database = createTestDatabase();
		const client = { getFlexMatchIds: vi.fn(), getMatch: vi.fn() };
		expect(await runHistory(database, client, 120, () => {}, () => {}, '2026-11-07'))
			.toMatchObject({ stopReason: 'failed', failures: 1, status: { collectionComplete: false, historyComplete: false } });
		expect(client.getFlexMatchIds).not.toHaveBeenCalled();
	});

	it('retains pages already collected on a rate limit and imports them once after relaunch', async () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Player');
		const page = Array.from({ length: 100 }, (_, i) => `EUW1_${i}`);
		const client = {
			getFlexMatchIds: vi.fn().mockResolvedValueOnce(page).mockRejectedValueOnce(new RateLimitError('HTTP 429')),
			getMatch: vi.fn(async (id: string) => match(id)),
		};
		expect(await runHistory(database, client, 120, () => {}, () => {}, '2026-11-07'))
			.toMatchObject({ stopReason: 'failed', failures: 1, status: { pendingRemaining: 100, collectionComplete: false } });
		expect(client.getMatch).not.toHaveBeenCalled();
		client.getFlexMatchIds.mockResolvedValueOnce(page).mockResolvedValueOnce([]);
		expect(await runHistory(database, client, 120, () => {}, () => {}, '2026-11-07'))
			.toMatchObject({ stopReason: 'complete', failures: 0 });
		expect(client.getMatch).toHaveBeenCalledTimes(100);
		expect(database.prepare('SELECT COUNT(*) AS count FROM matches').get()).toEqual({ count: 100 });
		expect(database.prepare('SELECT * FROM ingest_pending').all()).toEqual([]);
	});

	it('reports pagination, persisted imports, ranks, timelines and batch boundaries as work happens', async () => {
		const database = createTestDatabase();
		for (const member of fullLineup()) addPlayer(database, member.puuid, member.puuid);
		const progress = vi.fn();
		const client = {
			getFlexMatchIds: vi.fn(async () => {
				expect(progress).toHaveBeenLastCalledWith(expect.stringContaining('start=0 · count=100'));
				return ['EUW1_123'];
			}),
			getRankedMatchIds: vi.fn().mockResolvedValue([]),
			getMatch: vi.fn(async (id: string) => {
				expect(progress).toHaveBeenLastCalledWith(`Détails 1/1 : ${id}`);
				return match(id);
			}),
			getRankEntries: vi.fn().mockResolvedValue([]),
			getTimeline: vi.fn(async (id: string) => {
				expect(progress).toHaveBeenLastCalledWith(`Timeline 1/1 : ${id} · tentative=1`);
				return null;
			}),
		};
		const result = await runHistory(database, client, undefined, () => {}, progress);
		expect(result).toMatchObject({ batches: 1, failures: 0, stopReason: 'complete' });
		const messages = progress.mock.calls.map(([message]) => message).join('\n');
		expect(messages).toContain('Lot historique 1 : début');
		expect(messages).toContain('prochain offset=1 · terminée=true');
		expect(messages).toContain('EUW1_123 : importé · queue=440 · joueurs=5');
		expect(messages).toContain('Rangs player-0 : enregistrés · 0 entrées Riot');
		expect(messages).toContain('Timeline EUW1_123 : absente chez Riot');
		expect(messages).toContain('Lot enregistré : ok');
	});

	it('counts new imports per queue, existing rows, and repairs without changing team match semantics', async () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Player');
		addMatch(database, { id: 'EUW1_1', startedAt: 100, won: true, members: fullLineup().slice(0, 1) });
		addMatch(database, { id: 'EUW1_2', startedAt: 100, won: true, members: fullLineup().slice(0, 1), lineupSize: 2 });
		const client = {
			getFlexMatchIds: vi.fn().mockResolvedValue(['EUW1_1', 'EUW1_2', 'EUW1_3']),
			getRankedMatchIds: vi.fn().mockResolvedValue(['EUW1_4']),
			getMatch: vi.fn(async (id: string) => match(id, id === 'EUW1_4' ? 420 : 440)),
		};
		const result = await ingest(database, client, true);
		expect(result).toMatchObject({
			newMatches: 0, importedByQueue: { 440: 1, 420: 1 }, existingMatches: 1, repairedMatches: 1, failures: [],
		});
		expect(formatIngestSummary(result, true)).toContain('Lot historique réussi');
		expect(formatIngestSummary(result, true)).toContain('1 imports Flex, 1 imports Solo/Duo');
		expect(formatSyncStatus(readSyncStatus(database)).join('\n')).toContain('Historique terminé');
	});

	it('runs a single batch by default, then resumes persisted pages and details within a duration', async () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Player');
		const page = Array.from({ length: 100 }, (_, i) => `EUW1_${i}`);
		const client = {
			getFlexMatchIds: vi.fn().mockResolvedValueOnce(page).mockResolvedValueOnce(page.map((_, i) => `EUW1_${i + 100}`))
				.mockResolvedValueOnce(['EUW1_200']),
			getMatch: vi.fn(async (id: string) => match(id)),
		};
		const first = await runHistory(database, client);
		expect(first).toMatchObject({ batches: 1, stopReason: 'single-batch', failures: 0 });
		expect(first.status.historyComplete).toBe(false);
		expect(formatSyncStatus(first.status).join('\n')).toContain('Historique incomplet');
		const resumed = await runHistory(database, client, 60);
		expect(resumed).toMatchObject({ batches: 2, stopReason: 'complete', failures: 0 });
		expect(client.getFlexMatchIds.mock.calls.map((call) => call[1].start)).toEqual([0, 100, 200]);
		expect(database.prepare('SELECT COUNT(*) AS count FROM matches').get()).toEqual({ count: 201 });
	});

	it('stops at the scheduling budget without advancing an uncollected page or starting more HTTP work', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(1000);
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Player');
		const page = Array.from({ length: 100 }, (_, i) => `EUW1_${i}`);
		const client = {
			getFlexMatchIds: vi.fn(async () => { vi.setSystemTime(3000); return page; }),
			getMatch: vi.fn(), getRankEntries: vi.fn(),
		};
		expect(await runHistory(database, client, 1)).toMatchObject({ batches: 1, failures: 0, stopReason: 'budget' });
		expect(client.getFlexMatchIds).toHaveBeenCalledTimes(1);
		expect(client.getMatch).not.toHaveBeenCalled();
		expect(client.getRankEntries).not.toHaveBeenCalled();
		expect(database.prepare('SELECT next_start, is_complete FROM ingest_backfill_cursors').get()).toEqual({ next_start: 100, is_complete: 0 });
		expect(database.prepare('SELECT COUNT(*) AS count FROM ingest_pending').get()).toEqual({ count: 100 });
	});

	it('stops on failures instead of looping over HTTP retries or ready work', async () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Player');
		const client = { getFlexMatchIds: vi.fn().mockRejectedValue(new RateLimitError('HTTP 429')), getMatch: vi.fn() };
		expect(await runHistory(database, client, 60)).toMatchObject({ batches: 1, failures: 1, stopReason: 'failed' });
		expect(client.getFlexMatchIds).toHaveBeenCalledTimes(1);
		expect(client.getMatch).not.toHaveBeenCalled();
	});

	it('does not wait or retry deferred-only work and distinguishes it from completion', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(1000);
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Player');
		database.prepare('INSERT INTO ingest_pending (match_id, next_attempt_at) VALUES (?, ?)').run('EUW1_1', 10000);
		const client = { getFlexMatchIds: vi.fn().mockResolvedValue([]), getMatch: vi.fn() };
		const result = await runHistory(database, client, 60);
		expect(result).toMatchObject({ batches: 1, stopReason: 'deferred', failures: 0 });
		expect(result.status).toMatchObject({ pendingReady: 0, pendingDeferred: 1, nextRetryAt: 10000, historyComplete: false });
		expect(formatSyncStatus(result.status).join('\n')).toContain('Attendre la reprise');
		expect(client.getMatch).not.toHaveBeenCalled();
	});

	it('requires both ranked cursor sets and an empty detail queue for historical completion', () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Player');
		database.prepare('INSERT INTO ingest_backfill_cursors (puuid, queue_id, next_start, is_complete, updated_at) VALUES (?, ?, ?, ?, 0)')
			.run('player-0', 440, 0, 1);
		expect(readSyncStatus(database).historyComplete).toBe(false);
		database.prepare('INSERT INTO ingest_backfill_cursors (puuid, queue_id, next_start, is_complete, updated_at) VALUES (?, ?, ?, ?, 0)')
			.run('player-0', 420, 0, 1);
		expect(readSyncStatus(database).historyComplete).toBe(true);
		database.prepare('INSERT INTO ingest_pending (match_id) VALUES (?)').run('EUW1_1');
		expect(readSyncStatus(database)).toMatchObject({ historyComplete: false, pendingReady: 1 });
	});
});
