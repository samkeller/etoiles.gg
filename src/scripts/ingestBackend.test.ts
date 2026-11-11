import { afterEach, describe, expect, it, vi } from 'vitest';
import { addMatch, addPlayer, closeTestDatabases, createTestDatabase, fullLineup } from '../lib/stats/fixtures';
import type { MatchDto } from '../lib/types';
import { ingest } from './ingestBackend';
import { RateLimitError } from '../lib/backendHttp';
import { getMatchDetail, getMatches } from '../lib/stats/matches';
import { getIndividualProfiles } from '../lib/stats/individual';
import { getPlayers } from '../lib/stats/players';

afterEach(closeTestDatabases);

function raw(id: string, startedAt = 100): MatchDto {
	const fixture = createTestDatabase();
	addMatch(fixture, { id, startedAt, won: true, members: fullLineup() });
	const row = fixture.prepare('SELECT raw_json FROM matches').get() as { raw_json: string };
	return JSON.parse(row.raw_json);
}

function collision(id: string): MatchDto {
	const match = raw(id);
	const opponent = match.info.participants.find((participant) => participant.puuid === 'player-1')!;
	const replacement = match.info.participants.find((participant) => participant.puuid === 'enemy-0')!;
	opponent.teamId = 200;
	opponent.win = false;
	replacement.teamId = 100;
	replacement.win = true;
	return match;
}

describe('ingestion', () => {
	it('stores collisions as raw matches without admitting them to team stats and does not refetch them', async () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Étoile bleue');
		addPlayer(database, 'player-1', 'Étoile rouge');
		const match = collision('EUW1_7826789164');
		const client = {
			getFlexMatchIds: vi.fn().mockResolvedValue(['EUW1_7826789164']),
			getMatch: vi.fn().mockResolvedValue(match),
		};

		expect(await ingest(database, client)).toMatchObject({
			newMatches: 0,
			importedByQueue: { 440: 1 },
			failures: [],
			pendingRemaining: 0,
		});
		expect(database.prepare(`SELECT match_kind AS matchKind, raw_json AS rawJson FROM matches WHERE match_id = ?`)
			.get('EUW1_7826789164')).toEqual({ matchKind: 'collision', rawJson: JSON.stringify(match) });
		expect(database.prepare('SELECT COUNT(*) AS count FROM participants WHERE match_id = ?').get('EUW1_7826789164'))
			.toEqual({ count: 0 });
		expect(database.prepare('SELECT COUNT(*) AS count FROM ingest_pending').get()).toEqual({ count: 0 });

		database.prepare(`INSERT INTO participants
			(match_id, puuid, champion, role, kills, deaths, assists, win, lineup_size)
			VALUES (?, ?, 'Aatrox', 'TOP', 1, 0, 0, ?, 2)`).run('EUW1_7826789164', 'player-0', 1);
		database.prepare(`INSERT INTO participants
			(match_id, puuid, champion, role, kills, deaths, assists, win, lineup_size)
			VALUES (?, ?, 'Ahri', 'TOP', 0, 1, 0, ?, 2)`).run('EUW1_7826789164', 'player-1', 0);
		expect(getMatches(database)).toEqual([]);
		expect(getPlayers(database).map((player) => player.games)).toEqual([0, 0]);
		expect(getIndividualProfiles(database).map((profile) => ({
			puuid: profile.puuid, games: profile.flex.games, wins: profile.flex.wins,
			winRate: profile.flex.winRate, teamSize: profile.flex.recentMatches[0].teamSize,
		}))).toEqual([
			{ puuid: 'player-0', games: 1, wins: 1, winRate: 1, teamSize: 1 },
			{ puuid: 'player-1', games: 1, wins: 0, winRate: 0, teamSize: 1 },
		]);
		const detail = getMatchDetail(database, 'EUW1_7826789164');
		expect(detail?.isCollision).toBe(true);
		expect(detail?.teams.map((team) => ({
			side: team.side, isOurs: team.isOurs, members: team.participants.filter((participant) => participant.isMember).length,
		}))).toEqual([
			{ side: 'blue', isOurs: false, members: 1 },
			{ side: 'red', isOurs: false, members: 1 },
		]);

		client.getMatch.mockClear();
		expect((await ingest(database, client)).failures).toEqual([]);
		expect(client.getMatch).not.toHaveBeenCalled();
		expect(database.prepare('SELECT COUNT(*) AS count FROM participants').get()).toEqual({ count: 0 });
		client.getFlexMatchIds.mockResolvedValue([]);
		await ingest(database, client);
		expect(database.prepare('SELECT COUNT(*) AS count FROM ingest_pending').get()).toEqual({ count: 0 });
	});

	it('stops collecting on a rate limit and retains collected IDs and the unfinished cursor', async () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Original');
		addPlayer(database, 'player-1', 'Other');
		const page = Array.from({ length: 100 }, (_, index) => `EUW1_${index}`);
		const client = {
			getFlexMatchIds: vi.fn().mockResolvedValueOnce(page).mockRejectedValueOnce(new RateLimitError('HTTP 429')),
			getMatch: vi.fn(),
		};
		expect((await ingest(database, client, true)).failures).toEqual(['Flex collection player-0: HTTP 429']);
		expect(client.getFlexMatchIds).toHaveBeenCalledTimes(2);
		expect(client.getMatch).not.toHaveBeenCalled();
		expect(database.prepare('SELECT * FROM ingest_cursors').all()).toEqual([]);
		expect(database.prepare('SELECT puuid, queue_id AS queueId, next_start AS nextStart, is_complete AS isComplete FROM ingest_backfill_cursors')
			.all()).toEqual([{ puuid: 'player-0', queueId: 440, nextStart: 100, isComplete: 0 }]);
		expect(database.prepare('SELECT COUNT(*) AS count FROM ingest_pending').get()).toEqual({ count: 100 });
		expect(database.prepare('SELECT status FROM ingest_runs').get()).toEqual({ status: 'failed' });
	});

	it('stops processing on a rate limit and resumes pending matches on the next run', async () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Original');
		const client = {
			getFlexMatchIds: vi.fn().mockResolvedValueOnce(['EUW1_1', 'EUW1_2'])
				.mockResolvedValueOnce([]).mockResolvedValueOnce([]),
			getMatch: vi.fn().mockRejectedValueOnce(new RateLimitError('HTTP 429'))
				.mockResolvedValueOnce(raw('EUW1_2')).mockResolvedValueOnce(raw('EUW1_1')),
		};
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-11-09T08:00:00Z'));
		try {
			expect((await ingest(database, client, true)).failures).toEqual(['Match EUW1_1: HTTP 429']);
			expect(client.getMatch).toHaveBeenCalledTimes(1);
			expect(database.prepare('SELECT COUNT(*) AS count FROM ingest_pending').get()).toEqual({ count: 2 });
			expect(database.prepare('SELECT attempts, next_attempt_at FROM ingest_pending WHERE match_id = ?')
				.get('EUW1_1')).toEqual({ attempts: 1, next_attempt_at: Date.parse('2026-11-09T08:15:00Z') });
			expect((await ingest(database, client)).failures).toEqual([]);
			expect(client.getMatch).toHaveBeenCalledTimes(2);
			expect(database.prepare('SELECT COUNT(*) AS count FROM matches').get()).toEqual({ count: 1 });
			expect(database.prepare('SELECT match_id FROM ingest_pending').all()).toEqual([{ match_id: 'EUW1_1' }]);
			vi.setSystemTime(new Date('2026-11-09T08:16:00Z'));
			expect((await ingest(database, client)).failures).toEqual([]);
			expect(database.prepare('SELECT match_id FROM ingest_pending').all()).toEqual([]);
			expect(database.prepare('SELECT COUNT(*) AS count FROM matches').get()).toEqual({ count: 2 });
		} finally {
			vi.useRealTimers();
		}
	});

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
		expect(database.prepare('SELECT match_id FROM ingest_pending').all()).toEqual([]);
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
		expect(database.prepare('SELECT match_id FROM ingest_pending').all()).toEqual([{ match_id: 'EUW1_1' }]);
		expect(database.prepare('SELECT game_name FROM players WHERE puuid = ?').get('player-0')).toEqual({ game_name: 'Original' });
	});

	it('retains incomplete rows and a failed pending ID when the repair fetch fails', async () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Original');
		addMatch(database, { id: 'EUW1_1', startedAt: 1, won: true, members: fullLineup().slice(0, 1), lineupSize: 5 });
		const client = { getFlexMatchIds: vi.fn().mockResolvedValue(['EUW1_1']), getMatch: vi.fn().mockRejectedValue(new Error('offline')) };
		expect((await ingest(database, client)).failures).toEqual(['Match EUW1_1: offline']);
		expect(database.prepare('SELECT COUNT(*) AS count FROM participants').get()).toEqual({ count: 1 });
		expect(database.prepare('SELECT match_id FROM ingest_pending').all()).toEqual([{ match_id: 'EUW1_1' }]);
		expect(database.prepare('SELECT status FROM ingest_runs').get()).toEqual({ status: 'failed' });
	});

	it('records a failed run for an empty roster without calling Riot', async () => {
		const database = createTestDatabase();
		const client = { getFlexMatchIds: vi.fn(), getMatch: vi.fn() };
		expect((await ingest(database, client)).failures).toEqual(['No players in DB; run npm run sync -- setup first']);
		expect(database.prepare('SELECT status FROM ingest_runs').get()).toEqual({ status: 'failed' });
		expect(client.getFlexMatchIds).not.toHaveBeenCalled();
	});

	it('collects Solo/Duo into the individual queue without exposing it to team match lists', async () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Solo');
		const solo = raw('EUW1_420');
		solo.info.queueId = 420;
		const client = {
			getFlexMatchIds: vi.fn().mockResolvedValue([]),
			getRankedMatchIds: vi.fn().mockResolvedValue(['EUW1_420']),
			getMatch: vi.fn().mockResolvedValue(solo),
		};

		expect(await ingest(database, client, true)).toMatchObject({ newMatches: 0, failures: [] });
		expect(client.getRankedMatchIds).toHaveBeenCalledWith('player-0', {
			start: 0,
			count: 100,
			startTime: undefined,
			queue: 420,
		});
		expect(database.prepare('SELECT queue_id AS queueId FROM matches WHERE match_id = ?').get('EUW1_420')).toEqual({ queueId: 420 });
		expect(database.prepare('SELECT COUNT(*) AS count FROM participants WHERE match_id = ?').get('EUW1_420')).toEqual({ count: 1 });
		expect(database.prepare('SELECT COUNT(*) AS count FROM ingest_backfill_cursors WHERE queue_id = 420').get()).toEqual({ count: 1 });
		expect(database.prepare('SELECT COUNT(*) AS count FROM matches WHERE queue_id = 440').get()).toEqual({ count: 0 });

		client.getRankedMatchIds.mockResolvedValue([]);
		client.getMatch.mockClear();
		expect(await ingest(database, client)).toMatchObject({ newMatches: 0, failures: [] });
		expect(client.getMatch).not.toHaveBeenCalled();
	});

	it('starts a new Solo/Duo cursor with only a 24-hour overlap unless backfill is explicit', async () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Solo');
		const client = {
			getFlexMatchIds: vi.fn().mockResolvedValue([]),
			getRankedMatchIds: vi.fn().mockResolvedValue([]),
			getMatch: vi.fn(),
		};
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-11-08T12:00:00Z'));
		try {
			await ingest(database, client);
			expect(client.getRankedMatchIds).toHaveBeenCalledWith('player-0', {
				start: 0,
				count: 100,
				startTime: Math.floor(Date.parse('2026-11-08T12:00:00Z') / 1000) - 24 * 60 * 60,
				queue: 420,
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it('records both ranked ladders once per player and UTC day, including an unranked queue', async () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Ranked');
		const client = {
			getFlexMatchIds: vi.fn().mockResolvedValue([]),
			getRankedMatchIds: vi.fn().mockResolvedValue([]),
			getMatch: vi.fn(),
			getRankEntries: vi.fn().mockResolvedValue([
				{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II', leaguePoints: 35, wins: 18, losses: 12 },
				{ queueType: 'RANKED_TFT', tier: 'GOLD', rank: 'II', leaguePoints: 35, wins: 18, losses: 12 },
			]),
		};
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-11-08T12:00:00Z'));
		try {
			expect((await ingest(database, client)).failures).toEqual([]);
			expect(database.prepare(`SELECT queue_type AS queueType, tier, division, league_points AS leaguePoints
				FROM rank_snapshots ORDER BY queue_type`).all()).toEqual([
				{ queueType: 'RANKED_FLEX_SR', tier: null, division: null, leaguePoints: null },
				{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', division: 'II', leaguePoints: 35 },
			]);
			await ingest(database, client);
			expect(client.getRankEntries).toHaveBeenCalledTimes(1);
			expect(database.prepare('SELECT COUNT(*) AS count FROM rank_snapshots').get()).toEqual({ count: 2 });
			vi.setSystemTime(new Date('2026-11-09T12:00:00Z'));
			await ingest(database, client);
			expect(client.getRankEntries).toHaveBeenCalledTimes(2);
			expect(database.prepare('SELECT COUNT(*) AS count FROM rank_snapshots').get()).toEqual({ count: 4 });
		} finally {
			vi.useRealTimers();
		}
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
		expect(database.prepare('SELECT COUNT(*) AS count FROM matches').get()).toEqual({ count: 100 });
		expect(database.prepare('SELECT match_id FROM ingest_pending').all()).toEqual([{ match_id: 'EUW1_100' }]);
		client.getMatch.mockClear();
		expect((await ingest(database, client, true)).failures).toEqual([]);
		expect(client.getFlexMatchIds).toHaveBeenCalledTimes(2);
		expect(database.prepare('SELECT COUNT(*) AS count FROM matches').get()).toEqual({ count: 101 });
		expect(database.prepare('SELECT match_id FROM ingest_pending').all()).toEqual([]);

		client.getFlexMatchIds.mockClear().mockResolvedValueOnce(page).mockResolvedValueOnce(['EUW1_100']);
		client.getMatch.mockClear();
		await ingest(database, client);
		expect(client.getFlexMatchIds.mock.calls.map((call) => call[1].start)).toEqual([0, 100]);
		expect(client.getFlexMatchIds.mock.calls[0][1].startTime).toBeTypeOf('number');
		expect(client.getMatch).not.toHaveBeenCalled();
		expect(database.prepare('SELECT COUNT(*) AS count FROM matches').get()).toEqual({ count: 101 });
	});

	it('retains failed older matches even after newer successes advance the cursor', async () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Original');
		const client = {
			getFlexMatchIds: vi.fn().mockResolvedValueOnce(['EUW1_1', 'EUW1_2']).mockResolvedValueOnce([]),
			getMatch: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(raw('EUW1_2', 200))
				.mockResolvedValueOnce(raw('EUW1_1', 100)),
		};
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-11-09T08:00:00Z'));
		try {
			expect((await ingest(database, client)).failures).toHaveLength(1);
			expect(database.prepare('SELECT status FROM ingest_runs').get()).toEqual({ status: 'failed' });
			expect(database.prepare('SELECT match_id FROM ingest_pending').all()).toEqual([{ match_id: 'EUW1_1' }]);
			vi.setSystemTime(new Date('2026-11-09T08:02:00Z'));
			expect((await ingest(database, client)).failures).toEqual([]);
			expect(database.prepare('SELECT COUNT(*) AS count FROM matches').get()).toEqual({ count: 2 });
			expect(database.prepare('SELECT match_id FROM ingest_pending').all()).toEqual([]);
		} finally {
			vi.useRealTimers();
		}
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
		expect(database.prepare('SELECT match_id FROM ingest_pending').all()).toEqual([{ match_id: 'EUW1_1' }]);
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
