import { afterEach, describe, expect, it, vi } from 'vitest';
import { addMatch, addPlayer, closeTestDatabases, createTestDatabase, fullLineup } from '../lib/stats/fixtures';
import { syncAssets } from './syncAssetsBackend';

afterEach(closeTestDatabases);

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function response(url: string): Response {
	if (url.endsWith('versions.json')) return Response.json(['16.22.1']);
	if (url.endsWith('champion.json')) return Response.json({ data: { Aatrox: { id: 'Aatrox', name: 'Aatrox' } } });
	if (url.includes('summoners/by-puuid')) return Response.json({ profileIconId: 123 });
	return new Response(png);
}

describe('asset synchronization', () => {
	it('downloads profile icons and validated French champion names', async () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Name');
		const save = vi.fn().mockResolvedValue(undefined);
		const request = vi.fn(async (url: string) => response(url));
		expect(await syncAssets(database, { request, save, headers: { 'X-Riot-Token': 'test' } })).toEqual({ saved: 2, failures: [] });
		expect(save).toHaveBeenCalledWith('public\\riot\\profiles\\player-0.png', png);
		const names = save.mock.calls.find(([path]) => path.endsWith('champion-names.json'))!;
		expect(JSON.parse(names[1])).toEqual({ Aatrox: 'Aatrox' });
		expect(request).toHaveBeenCalledWith(expect.stringContaining('/img/profileicon/123.png'));
	});

	it('reports HTTP profile failures, continues independent assets, and never writes an error response', async () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Name');
		const save = vi.fn().mockResolvedValue(undefined);
		const request = vi.fn(async (url: string) => url.includes('summoners/by-puuid') ? Response.json({ status: {} }, { status: 403 }) : response(url));
		const result = await syncAssets(database, { request, save, headers: {} });
		expect(result.failures).toEqual(['Profile player-0: HTTP 403']);
		expect(result.saved).toBe(1);
		expect(save.mock.calls.some(([path]) => path.includes('profiles'))).toBe(false);
	});

	it('reports missing profile IDs and malformed images instead of success', async () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Name');
		addMatch(database, { id: 'EUW1_1', startedAt: 1, won: true, members: fullLineup() });
		const request = vi.fn(async (url: string) => {
			if (url.includes('summoners/by-puuid')) return Response.json({ status: { message: 'missing' } });
			if (url.endsWith('.png')) return new Response('not an image');
			return response(url);
		});
		const result = await syncAssets(database, { request, save: vi.fn(), headers: {} });
		expect(result.failures).toEqual(['Champion Aatrox: Invalid PNG response', 'Champion Ahri: Invalid PNG response', 'Profile player-0: Invalid summoner response']);
	});

	it('stops cleanly on version HTTP errors without writing files', async () => {
		const request = vi.fn().mockResolvedValue(Response.json({ status: {} }, { status: 500 }));
		const save = vi.fn();
		expect(await syncAssets(createTestDatabase(), { request, save })).toEqual({ saved: 0, failures: ['Data Dragon versions: HTTP 500'] });
		expect(save).not.toHaveBeenCalled();
		expect(request).toHaveBeenCalledTimes(1);
	});
});
