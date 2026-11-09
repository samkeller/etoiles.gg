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
	});

	it.each([
		['wat'], ['update', 'extra'], ['status', '--force'], ['setup', '--force'],
		['history', '--max-duration'], ['history', '--max-duration', '0'],
		['history', '--max-duration', '-1'], ['history', '--max-duration', 'NaN'],
		['history', '--max-duration', 'Infinity'], ['history', '--max-duration', '86401'],
		['history', '--max-duration', '1s'], ['history', '--max-duration', ''],
		['history', '--max-duration', '1', '--max-duration', '2'],
		['history', '--loop'], ['help', 'extra'],
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
