import { afterEach, describe, expect, it, vi } from 'vitest';
import { addMatch, addPlayer, closeTestDatabases, createTestDatabase, fullLineup } from '../lib/stats/fixtures';
import type { MatchDto } from '../lib/types';
import { ingest } from './ingestBackend';

afterEach(closeTestDatabases);

function raw(id: string, startedAt = 100): MatchDto {
	const fixture = createTestDatabase();
	addMatch(fixture, { id, startedAt, won: true, members: fullLineup() });
	const row = fixture.prepare('SELECT raw_json FROM matches').get() as { raw_json: string };
	return JSON.parse(row.raw_json);
}

describe('ingestion', () => {
	it('repairs legacy incomplete matches behind the cursor even if no new IDs are listed', async () => {
		const database = createTestDatabase();
		for (let i = 0; i < 5; i++) addPlayer(database, `player-${i}`, `Original ${i}`);
		addMatch(database, { id: 'EUW1_1', startedAt: 1, won: true, members: fullLineup() });
		database.exec(`DELETE FROM participants WHERE puuid != 'player-0';
			INSERT INTO ingest_cursors VALUES ('player-0', 999999)`);
		const client = { getFlexMatchIds: vi.fn().mockResolvedValue([]), getMatch: vi.fn().mockResolvedValue(raw('EUW1_1', 1)) };
		expect((await ingest(database, client)).failures).toEqual([]);
		expect(client.getMatch).toHaveBeenCalledWith('EUW1_1');
		expect(database.prepare('SELECT COUNT(*) AS count FROM participants').get()).toEqual({ count: 5 });
		expect(database.prepare('SELECT * FROM ingest_pending').all()).toEqual([]);
	});

	it('keeps legacy data and pending repair when a fetched replacement fails atomically', async () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Original');
		addPlayer(database, 'player-1', 'Other');
		addMatch(database, { id: 'EUW1_1', startedAt: 1, won: true, members: fullLineup().slice(0, 1), lineupSize: 2 });
		database.exec(`CREATE TRIGGER fail_repair BEFORE INSERT ON participants WHEN NEW.puuid = 'player-1'
			BEGIN SELECT RAISE(ABORT, 'test repair failure'); END`);
		const client = { getFlexMatchIds: vi.fn().mockResolvedValue([]), getMatch: vi.fn().mockResolvedValue(raw('EUW1_1', 1)) };
		expect((await ingest(database, client)).failures).toHaveLength(1);
		expect(database.prepare('SELECT COUNT(*) AS count FROM matches').get()).toEqual({ count: 1 });
		expect(database.prepare('SELECT puuid, lineup_size FROM participants').all()).toEqual([{ puuid: 'player-0', lineup_size: 2 }]);
		expect(database.prepare('SELECT * FROM ingest_pending').all()).toEqual([{ match_id: 'EUW1_1' }]);
		expect(database.prepare('SELECT game_name FROM players WHERE puuid = ?').get('player-0')).toEqual({ game_name: 'Original' });
	});

	it('retains incomplete rows and a failed pending ID when the repair fetch fails', async () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Original');
		addMatch(database, { id: 'EUW1_1', startedAt: 1, won: true, members: fullLineup().slice(0, 1), lineupSize: 5 });
		const client = { getFlexMatchIds: vi.fn().mockResolvedValue(['EUW1_1']), getMatch: vi.fn().mockRejectedValue(new Error('offline')) };
		expect((await ingest(database, client)).failures).toEqual(['Match EUW1_1: offline']);
		expect(database.prepare('SELECT COUNT(*) AS count FROM participants').get()).toEqual({ count: 1 });
		expect(database.prepare('SELECT * FROM ingest_pending').all()).toEqual([{ match_id: 'EUW1_1' }]);
		expect(database.prepare('SELECT status FROM ingest_runs').get()).toEqual({ status: 'failed' });
	});

	it('records a failed run for an empty roster without calling Riot', async () => {
		const database = createTestDatabase();
		const client = { getFlexMatchIds: vi.fn(), getMatch: vi.fn() };
		expect((await ingest(database, client)).failures).toEqual(['No players in DB; run resolvePuids first']);
		expect(database.prepare('SELECT status FROM ingest_runs').get()).toEqual({ status: 'failed' });
		expect(client.getFlexMatchIds).not.toHaveBeenCalled();
	});

	it('paginates backfills and incremental collections and deduplicates IDs', async () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Original');
		const page = Array.from({ length: 100 }, (_, index) => `EUW1_${index}`);
		const client = {
			getFlexMatchIds: vi.fn().mockResolvedValueOnce(page).mockResolvedValueOnce(['EUW1_100']),
			getMatch: vi.fn(async (id: string) => raw(id)),
		};
		expect((await ingest(database, client, true)).failures).toEqual([]);
		expect(client.getFlexMatchIds.mock.calls.map((call) => call[1].start)).toEqual([0, 100]);
		expect(database.prepare('SELECT COUNT(*) AS count FROM matches').get()).toEqual({ count: 101 });
		client.getFlexMatchIds.mockClear().mockResolvedValueOnce(page).mockResolvedValueOnce(['EUW1_100']);
		client.getMatch.mockClear();
		await ingest(database, client);
		expect(client.getFlexMatchIds.mock.calls.map((call) => call[1].start)).toEqual([0, 100]);
		expect(client.getFlexMatchIds.mock.calls[0][1].startTime).toBeTypeOf('number');
		expect(client.getMatch).not.toHaveBeenCalled();
	});

	it('retains failed older matches even after newer successes advance the cursor', async () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Original');
		const client = {
			getFlexMatchIds: vi.fn().mockResolvedValueOnce(['EUW1_1', 'EUW1_2']).mockResolvedValueOnce([]),
			getMatch: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(raw('EUW1_2', 200))
				.mockResolvedValueOnce(raw('EUW1_1', 100)),
		};
		expect((await ingest(database, client)).failures).toHaveLength(1);
		expect(database.prepare('SELECT status FROM ingest_runs').get()).toEqual({ status: 'failed' });
		expect(database.prepare('SELECT match_id FROM ingest_pending').all()).toEqual([{ match_id: 'EUW1_1' }]);
		expect((await ingest(database, client)).failures).toEqual([]);
		expect(database.prepare('SELECT COUNT(*) AS count FROM matches').get()).toEqual({ count: 2 });
		expect(database.prepare('SELECT * FROM ingest_pending').all()).toEqual([]);
	});

	it('rolls back the match, participants and renamed players after an insertion failure', async () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Original');
		addPlayer(database, 'player-1', 'Other');
		database.exec(`CREATE TRIGGER fail_participant BEFORE INSERT ON participants WHEN NEW.puuid = 'player-1'
			BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
		const client = { getFlexMatchIds: vi.fn().mockResolvedValue(['EUW1_1']), getMatch: vi.fn().mockResolvedValue(raw('EUW1_1')) };
		expect((await ingest(database, client)).failures).toHaveLength(1);
		expect(database.prepare('SELECT * FROM matches').all()).toEqual([]);
		expect(database.prepare('SELECT * FROM participants').all()).toEqual([]);
		expect(database.prepare('SELECT game_name FROM players WHERE puuid = ?').get('player-0')).toEqual({ game_name: 'Original' });
		expect(database.prepare('SELECT * FROM ingest_pending').all()).toEqual([{ match_id: 'EUW1_1' }]);
	});

	it('does not advance a player cursor when collection fails partway through', async () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Original');
		const page = Array.from({ length: 100 }, (_, index) => `EUW1_${index}`);
		const client = {
			getFlexMatchIds: vi.fn().mockResolvedValueOnce(page).mockRejectedValueOnce(new Error('collection failed')),
			getMatch: vi.fn().mockRejectedValue(new Error('offline')),
		};
		const result = await ingest(database, client);
		expect(result.failures).toHaveLength(101);
		expect(database.prepare('SELECT * FROM ingest_cursors').all()).toEqual([]);
		expect(database.prepare('SELECT COUNT(*) AS count FROM ingest_pending').get()).toEqual({ count: 100 });
	});
});
