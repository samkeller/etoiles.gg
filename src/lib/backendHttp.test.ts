import { afterEach, describe, expect, it, vi } from 'vitest';
import { deferredRetryDelay, RateLimitError, request } from './backendHttp';
import { getFlexMatchIds, getMatch, getPuuid, getRankEntries, getTimeline, parseRiotId, riotHeaders } from './riot';
import { addMatch, closeTestDatabases, createTestDatabase, fullLineup } from './stats/fixtures';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); closeTestDatabases(); });

describe('bounded HTTP requests', () => {
	it('reports HTTP retries before sleeping with no request credentials or URL', async () => {
		vi.stubGlobal('fetch', vi.fn()
			.mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '90' } }))
			.mockResolvedValueOnce(new Response('ok')));
		const onRetry = vi.fn();
		const sleep = vi.fn(async () => {
			expect(onRetry).toHaveBeenCalledWith({ reason: 'HTTP 429', attempt: 1, maxRetries: 3, delayMs: 90_000 });
		});
		await request('https://example.test/private', { sleep, onRetry, maxRetryAfterMs: 300_000 });
		expect(onRetry).toHaveBeenCalledOnce();
	});

	it('reports bounded network retries and no retry on the final failure', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('private URL', 'TimeoutError')));
		const onRetry = vi.fn();
		await expect(request('https://example.test', { onRetry, maxRetries: 1, sleep: async () => {} }))
			.rejects.toThrow('private URL');
		expect(onRetry.mock.calls).toEqual([[{ reason: 'TimeoutError', attempt: 1, maxRetries: 1, delayMs: 1000 }]]);
	});

	it('forwards the retry observer through all Riot endpoints', async () => {
		vi.stubEnv('RIOT_API_KEY', 'RGAPI-00000000-0000-0000-0000-000000000000');
		vi.useFakeTimers();
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		const onRetry = vi.fn();
		const cases = [
			() => getPuuid('Player#EUW', { onRetry }),
			() => getFlexMatchIds('player', {}, { onRetry }),
			() => getMatch('EUW1_1', { onRetry }),
			() => getTimeline('EUW1_1', { onRetry }),
			() => getRankEntries('player', { onRetry }),
		];
		for (const run of cases) {
			fetch.mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '2' } }))
				.mockResolvedValueOnce(new Response('', { status: 403 }));
			const result = expect(run()).rejects.toThrow('HTTP 403');
			await vi.advanceTimersByTimeAsync(2000);
			await result;
		}
		expect(onRetry).toHaveBeenCalledTimes(cases.length);
	});

	it('preserves long Retry-After delays for durable retries even when the request retry budget is exhausted', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429, headers: { 'retry-after': '86400' } })));
		await expect(request('https://example.test', { maxRetries: 0 })).rejects.toMatchObject({ retryAfterMs: 86400000 });
		expect(deferredRetryDelay(new RateLimitError('HTTP 429', 86400000), 0)).toBe(86400000);
		expect(deferredRetryDelay(new Error('503'), 10)).toBeLessThanOrEqual(6 * 60 * 60_000);
	});
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

	it('includes Riot error messages without exposing query parameters', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
			status: { message: 'Bad request - invalid parameter\nMore info', status_code: 400 },
		}, { status: 400 })));
		await expect(request('https://example.test/private/path?api_key=secret'))
			.rejects.toThrow('HTTP 400 for /private/path: Bad request - invalid parameter More info');
	});

	it('keeps the HTTP failure readable when the error body is invalid JSON', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{invalid', {
			status: 400, headers: { 'content-type': 'application/json' },
		})));
		await expect(request('https://example.test/private/path')).rejects.toThrow('HTTP 400 for /private/path');
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
	it('treats only timeline 404 as unavailable, never authentication failures', async () => {
		vi.stubEnv('RIOT_API_KEY', 'RGAPI-00000000-0000-0000-0000-000000000000');
		const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 404 }))
			.mockResolvedValueOnce(new Response('', { status: 403 })).mockResolvedValueOnce(Response.json({ info: {} }));
		vi.stubGlobal('fetch', fetch);
		expect(await getTimeline('EUW1_1')).toBeNull();
		expect(fetch.mock.calls[0][0]).toBe('https://europe.api.riotgames.com/lol/match/v5/matches/EUW1_1/timeline');
		await expect(getTimeline('EUW1_1')).rejects.toThrow('HTTP 403');
		expect(await getTimeline('EUW1_1')).toEqual({ info: {} });
		await expect(getTimeline('../bad')).rejects.toThrow('Invalid match ID');
		expect(fetch).toHaveBeenCalledTimes(3);
	});
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
