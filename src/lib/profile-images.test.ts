import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addPlayer, closeTestDatabases, createTestDatabase } from './stats/fixtures';
import { getProfileImage, profileImageCachePath } from './profile-images';

afterEach(() => {
	vi.unstubAllEnvs();
	closeTestDatabases();
});

const puuid = 'A'.repeat(78);
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

describe('dynamic profile images', () => {
	it('fetches a missing icon from Riot and Data Dragon, then serves the persistent cache', async () => {
		const database = createTestDatabase();
		addPlayer(database, puuid, 'Player');
		const cacheDirectory = await mkdtemp(join(tmpdir(), 'etoiles-profile-images-'));
		const fetch = vi.fn(async (url: string) => {
			if (url.includes('/summoners/by-puuid/')) return Response.json({ profileIconId: 123 });
			if (url.endsWith('/api/versions.json')) return Response.json(['16.22.1']);
			return new Response(png, { headers: { 'content-type': 'image/png' } });
		});
		try {
			const first = await getProfileImage(database, puuid, { request: fetch, headers: {}, cacheDirectory });
			expect(first?.status).toBe(200);
			expect(first?.headers.get('content-type')).toBe('image/png');
			expect(Buffer.from(await first!.arrayBuffer())).toEqual(png);
			expect(fetch.mock.calls.map(([url]) => url)).toEqual([
				`https://euw1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`,
				'https://ddragon.leagueoflegends.com/api/versions.json',
				'https://ddragon.leagueoflegends.com/cdn/16.22.1/img/profileicon/123.png',
			]);
			expect(await readFile(profileImageCachePath(puuid, cacheDirectory))).toEqual(png);

			const second = await getProfileImage(database, puuid, {
				request: fetch, headers: {}, cacheDirectory, now: () => Date.now() + 1000,
			});
			expect(second?.status).toBe(200);
			expect(fetch).toHaveBeenCalledTimes(3);
		} finally {
			await rm(cacheDirectory, { recursive: true, force: true });
		}
	});

	it('does not fetch icons for unknown players or malformed PUUIDs', async () => {
		const database = createTestDatabase();
		const fetch = vi.fn();
		expect(await getProfileImage(database, puuid, { request: fetch, headers: {} })).toBeNull();
		expect(await getProfileImage(database, 'not-a-puuid', { request: fetch, headers: {} })).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('serves a stale cached icon if the upstream refresh fails', async () => {
		const database = createTestDatabase();
		addPlayer(database, puuid, 'Player');
		const cacheDirectory = await mkdtemp(join(tmpdir(), 'etoiles-profile-images-'));
		await writeFile(profileImageCachePath(puuid, cacheDirectory), png);
		const fetch = vi.fn().mockRejectedValue(new Error('upstream unavailable'));
		try {
			const response = await getProfileImage(database, puuid, {
				request: fetch, headers: {}, cacheDirectory, now: () => Date.now() + 2 * 24 * 60 * 60_000,
			});
			expect(response?.status).toBe(200);
			expect(response?.headers.get('warning')).toContain('Response is stale');
			expect(Buffer.from(await response!.arrayBuffer())).toEqual(png);
		} finally {
			await rm(cacheDirectory, { recursive: true, force: true });
		}
	});

	it('rejects invalid Riot and PNG responses rather than caching them', async () => {
		const database = createTestDatabase();
		addPlayer(database, puuid, 'Player');
		const cacheDirectory = await mkdtemp(join(tmpdir(), 'etoiles-profile-images-'));
		try {
			await expect(getProfileImage(database, puuid, {
				request: vi.fn().mockResolvedValueOnce(Response.json({})),
				headers: {}, cacheDirectory,
			})).rejects.toThrow('invalid profile icon ID');

			const invalidPng = vi.fn(async (url: string) => url.includes('/summoners/by-puuid/')
				? Response.json({ profileIconId: 123 })
				: url.endsWith('/api/versions.json') ? Response.json(['16.22.1']) : new Response('not png'));
			await expect(getProfileImage(database, puuid, { request: invalidPng, headers: {}, cacheDirectory }))
				.rejects.toThrow('invalid PNG data');
		} finally {
			await rm(cacheDirectory, { recursive: true, force: true });
		}
	});
});
