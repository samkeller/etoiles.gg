import type Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { addPlayer, createTestDatabase, closeTestDatabases } from '../lib/stats/fixtures';
import * as riot from '../lib/riot';
import { executeSyncCommand } from './syncCli';

const state = vi.hoisted(() => ({ database: undefined as Database.Database | undefined }));
vi.mock('../lib/db/db', () => ({ get db() { return state.database; } }));
vi.mock('../lib/riot', async (original) => ({
	...await original<typeof import('../lib/riot')>(),
	riotHeaders: vi.fn(() => ({ 'X-Riot-Token': 'not-for-logs' })),
	getPuuid: vi.fn(),
}));

beforeEach(() => {
	state.database = createTestDatabase();
	vi.useFakeTimers();
	vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
	closeTestDatabases();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

it('reports a slow setup honestly and clears timers after completion', async () => {
	let resolve!: (value: string) => void;
	vi.mocked(riot.getPuuid).mockImplementation(() => new Promise((done) => { resolve = done; }));
	const running = executeSyncCommand({ command: 'setup', riotIds: ['Player#EUW'] });
	await vi.advanceTimersByTimeAsync(45_000);
	expect(console.log).toHaveBeenCalledWith(expect.stringContaining('résolution de Player#EUW'));
	expect(console.log).toHaveBeenCalledWith(expect.stringContaining('15 s sans nouvelle progression'));
	expect(vi.mocked(console.log).mock.calls.filter(([line]) => String(line).includes('sans nouvelle progression'))).toHaveLength(1);
	resolve('player');
	await running;
	expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Player#EUW enregistré'));
	expect(console.log).toHaveBeenCalledWith(expect.stringContaining('durée totale=45.0 s'));
	expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('not-for-logs');
	expect(vi.getTimerCount()).toBe(0);
});

it('throttles routine progress while preserving the final summary', async () => {
	vi.mocked(riot.getPuuid).mockImplementation(async (id) => id.replace('#', '-'));
	await executeSyncCommand({ command: 'setup', riotIds: Array.from({ length: 20 }, (_, i) => `Player${i}#EUW`) });
	expect(vi.mocked(console.log).mock.calls.filter(([line]) => String(line).includes('résolution de'))).toHaveLength(1);
	expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Setup réussi : 20 joueurs'));
	expect(console.log).toHaveBeenCalledTimes(6);
});

it('reports rate-limit waits immediately without repeating waiting reminders', async () => {
	vi.mocked(riot.getPuuid).mockImplementation(async (_id, options) => {
		options?.onRetry?.({ reason: 'HTTP 429', attempt: 1, maxRetries: 3, delayMs: 120_000 });
		await new Promise((resolve) => setTimeout(resolve, 120_000));
		return 'player';
	});
	const running = executeSyncCommand({ command: 'setup', riotIds: ['Player#EUW'] });
	await vi.advanceTimersByTimeAsync(120_000);
	await running;
	expect(console.log).toHaveBeenCalledWith(expect.stringContaining('HTTP 429 · reprise 1/3 dans 120 s'));
	expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('sans nouvelle progression');
	expect(vi.getTimerCount()).toBe(0);
});

it('clears timers and does not report successful setup after a failure', async () => {
	vi.mocked(riot.getPuuid).mockRejectedValue(new Error('network failure'));
	await expect(executeSyncCommand({ command: 'setup', riotIds: ['Player#EUW'] })).rejects.toThrow('network failure');
	expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('Setup réussi');
	expect(vi.getTimerCount()).toBe(0);
});

it('keeps status output free of progress logs and timers', async () => {
	await executeSyncCommand({ command: 'status' });
	expect(console.log).toHaveBeenCalledWith(expect.stringContaining('File d’attente'));
	expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('Configuration');
	expect(vi.getTimerCount()).toBe(0);
});

it('passes the dated window through the CLI and reports catch-up instead of completed global cursors', async () => {
	vi.setSystemTime(new Date('2026-11-11T12:00:00Z'));
	addPlayer(state.database!, 'player-0', 'Player');
	state.database!.exec(`INSERT INTO ingest_backfill_cursors VALUES ('player-0', 440, 100, 1, 0);
		INSERT INTO ingest_backfill_cursors VALUES ('player-0', 420, 100, 1, 0)`);
	const flex = vi.spyOn(riot, 'getFlexMatchIds').mockResolvedValue([]);
	const solo = vi.spyOn(riot, 'getRankedMatchIds').mockResolvedValue([]);
	vi.spyOn(riot, 'getRankEntries').mockResolvedValue([]);
	vi.spyOn(riot, 'getTimeline').mockResolvedValue(null);
	await executeSyncCommand({ command: 'history', since: '2026-11-07', maxDurationSeconds: 120 });
	const startTime = Date.parse('2026-11-07T00:00:00Z') / 1000;
	expect(flex).toHaveBeenCalledWith('player-0', { start: 0, count: 100, startTime, queue: 440 }, expect.any(Object));
	expect(solo).toHaveBeenCalledWith('player-0', { start: 0, count: 100, startTime, queue: 420 }, expect.any(Object));
	expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Rattrapage terminé'));
	expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('Aucun joueur enregistré');
	expect(vi.getTimerCount()).toBe(0);
});
