import { afterEach, describe, expect, it, vi } from 'vitest';
import { RateLimitError, request } from './backendHttp';
import { getFlexMatchIds, getMatch, getPuuid, getRankEntries, parseRiotId, riotHeaders } from './riot';
import { addMatch, closeTestDatabases, createTestDatabase, fullLineup } from './stats/fixtures';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); closeTestDatabases(); });

describe('bounded HTTP requests', () => {
	it('respects Retry-After within its wait budget and eventually succeeds', async () => {
		const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '2' } }))
			.mockResolvedValueOnce(new Response('[]'));
		vi.stubGlobal('fetch', fetch);
		const sleep = vi.fn().mockResolvedValue(undefined);
		expect(await (await request('https://example.test/path', { sleep })).json()).toEqual([]);
		expect(sleep).toHaveBeenCalledWith(2000);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('fails explicitly instead of retrying earlier than an excessive Retry-After', async () => {
		const fetch = vi.fn().mockResolvedValue(new Response('', { status: 429, headers: { 'retry-after': '999999' } }));
		const sleep = vi.fn();
		vi.stubGlobal('fetch', fetch);
		await expect(request('https://example.test', { sleep })).rejects.toThrow('Retry-After 999999s exceeds');
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(sleep).not.toHaveBeenCalled();
	});

	it('bounds Riot waits at five minutes and honors longer Retry-After values', async () => {
		const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '120' } }))
			.mockResolvedValueOnce(Response.json([]));
		vi.stubEnv('RIOT_API_KEY', 'RGAPI-00000000-0000-0000-0000-000000000000');
		vi.stubGlobal('fetch', fetch);
		vi.useFakeTimers();
		const result = getFlexMatchIds('player', {});
		await vi.advanceTimersByTimeAsync(119_999);
		expect(fetch).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(await result).toEqual([]);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('exposes an exhausted 429 as a rate-limit error', async () => {
		const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response('', { status: 429 })));
		vi.stubGlobal('fetch', fetch);
		await expect(request('https://example.test', { sleep: async () => {}, maxRetries: 2 })).rejects.toBeInstanceOf(RateLimitError);
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it('accepts a five-minute Retry-After but rejects longer waits', async () => {
		const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '300' } }))
			.mockResolvedValueOnce(new Response('ok'));
		const sleep = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('fetch', fetch);
		await request('https://example.test', { sleep, maxRetryAfterMs: 300_000 });
		expect(sleep).toHaveBeenCalledWith(300_000);
		fetch.mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '301' } }));
		await expect(request('https://example.test', { sleep, maxRetryAfterMs: 300_000 })).rejects.toBeInstanceOf(RateLimitError);
		expect(sleep).toHaveBeenCalledTimes(1);
	});

	it('stops retrying transient failures and never retries authentication errors', async () => {
		const fetch = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
		vi.stubGlobal('fetch', fetch);
		await expect(request('https://example.test', { sleep: async () => {}, maxRetries: 2 })).rejects.toThrow('HTTP 503');
		expect(fetch).toHaveBeenCalledTimes(3);
		fetch.mockClear().mockResolvedValue(new Response('', { status: 403 }));
		await expect(request('https://example.test')).rejects.toThrow('HTTP 403');
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('aborts timed out requests and bounds network retries', async () => {
		const fetch = vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
			options.signal!.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
		}));
		vi.stubGlobal('fetch', fetch);
		await expect(request('https://example.test', { timeoutMs: 5, maxRetries: 1, sleep: async () => {} })).rejects.toThrow('timeout');
		expect(fetch).toHaveBeenCalledTimes(2);
	});
});

describe('Riot replies and validation', () => {
	it('validates keys and Riot IDs before sending requests', async () => {
		vi.stubEnv('RIOT_API_KEY', '');
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		expect(() => riotHeaders()).toThrow('RIOT_API_KEY');
		await expect(getPuuid('name#tag')).rejects.toThrow('RIOT_API_KEY');
		vi.stubEnv('RIOT_API_KEY', 'RGAPI-not-a-valid-key');
		expect(() => riotHeaders()).toThrow('RIOT_API_KEY');
		for (const id of ['', 'name', '#tag', 'name#', 'name#tag#other']) expect(() => parseRiotId(id)).toThrow('Invalid Riot ID');
		expect(parseRiotId(' name # tag ')).toEqual(['name', 'tag']);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('encodes Riot IDs, retains startTime zero, and rejects malformed replies', async () => {
		vi.stubEnv('RIOT_API_KEY', 'RGAPI-00000000-0000-0000-0000-000000000000');
		const fetch = vi.fn().mockResolvedValueOnce(Response.json({ puuid: 'player' }))
			.mockResolvedValueOnce(Response.json(['EUW1_1'])).mockResolvedValueOnce(Response.json({ status: {} }));
		vi.stubGlobal('fetch', fetch);
		expect(await getPuuid('A B#EUW')).toBe('player');
		expect(fetch.mock.calls[0][0]).toContain('/A%20B/EUW');
		expect(await getFlexMatchIds('player', { start: 100, count: 100, startTime: 0 })).toEqual(['EUW1_1']);
		expect(fetch.mock.calls[1][0]).toContain('startTime=0');
		await expect(getMatch('EUW1_1')).rejects.toThrow('Malformed raw match');
	});

	it('returns a validated MatchDto and rejects invalid account and ID list payloads', async () => {
		vi.stubEnv('RIOT_API_KEY', 'RGAPI-00000000-0000-0000-0000-000000000000');
		const database = createTestDatabase();
		addMatch(database, { id: 'EUW1_1', startedAt: 1, won: true, members: fullLineup() });
		const row = database.prepare('SELECT raw_json FROM matches').get() as { raw_json: string };
		const match = JSON.parse(row.raw_json);
		vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(match))
			.mockResolvedValueOnce(Response.json({ status: {} })).mockResolvedValueOnce(Response.json(['bad-id'])));
		expect(await getMatch('EUW1_1')).toEqual(match);
		await expect(getPuuid('name#tag')).rejects.toThrow('Invalid Riot account');
		await expect(getFlexMatchIds('player', {})).rejects.toThrow('Invalid Riot match list');
	});

	it('uses the platform League endpoint and validates rank entries', async () => {
		vi.stubEnv('RIOT_API_KEY', 'RGAPI-00000000-0000-0000-0000-000000000000');
		vi.stubEnv('RIOT_PLATFORM', 'euw1');
		const fetch = vi.fn().mockResolvedValueOnce(Response.json([
			{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II', leaguePoints: 35, wins: 18, losses: 12 },
			{ queueType: 'RANKED_TFT', tier: 'GOLD', rank: 'II', leaguePoints: 35, wins: 18, losses: 12 },
		]));
		vi.stubGlobal('fetch', fetch);

		expect(await getRankEntries('player-puuid')).toEqual([
			{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II', leaguePoints: 35, wins: 18, losses: 12 },
			{ queueType: 'RANKED_TFT', tier: 'GOLD', rank: 'II', leaguePoints: 35, wins: 18, losses: 12 },
		]);
		expect(fetch.mock.calls[0][0]).toContain('https://euw1.api.riotgames.com/lol/league/v4/entries/by-puuid/');

		vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json([{ queueType: 'RANKED_TFT', tier: 3 }])));
		await expect(getRankEntries('player-puuid')).rejects.toThrow('Invalid Riot league entries response');
	});
});
