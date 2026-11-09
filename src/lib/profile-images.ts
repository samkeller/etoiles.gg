import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { HttpError, request, type RequestOptions } from './backendHttp';
import { riotHeaders } from './riot';

const RIOT_PLATFORM = 'euw1';
const DATA_DRAGON = 'https://ddragon.leagueoflegends.com';
const MAX_AGE_MS = 24 * 60 * 60_000;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export class ProfileImageUpstreamError extends Error {}

type Requester = (url: string, options?: RequestOptions) => Promise<Response>;
type Dependencies = {
	request?: Requester;
	headers?: Record<string, string>;
	cacheDirectory?: string;
	now?: () => number;
};

type CachedImage = { bytes: Buffer; updatedAt: number };

const refreshes = new Map<string, Promise<Buffer>>();

function isPuuid(value: string): boolean {
	return /^[A-Za-z0-9_-]{78}$/.test(value);
}

export function profileImageCacheDirectory(): string {
	const databasePath = process.env.DATABASE_PATH ?? './etoiles.db';
	const databaseDirectory = databasePath === ':memory:' ? process.cwd() : dirname(resolve(databasePath));
	return join(databaseDirectory, '.cache', 'riot', 'profiles');
}

export function profileImageCachePath(puuid: string, cacheDirectory = profileImageCacheDirectory()): string {
	if (!isPuuid(puuid)) throw new Error('Invalid PUUID');
	return join(cacheDirectory, `${puuid}.png`);
}

async function cachedImage(path: string): Promise<CachedImage | undefined> {
	let metadata;
	try {
		metadata = await stat(path);
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return undefined;
		throw error;
	}
	const bytes = await readFile(path);
	if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
		await rm(path, { force: true });
		return undefined;
	}
	return { bytes, updatedAt: metadata.mtimeMs };
}

function upstreamError(error: unknown, operation: string): ProfileImageUpstreamError {
	const status = error instanceof HttpError ? `HTTP ${error.status}` : 'network error';
	return new ProfileImageUpstreamError(`${operation} failed (${status}).`);
}

async function json(fetchAsset: Requester, url: string, options?: RequestOptions): Promise<unknown> {
	let response: Response;
	try {
		response = await fetchAsset(url, options);
	} catch (error) {
		throw upstreamError(error, 'Profile image upstream request');
	}
	if (!response.ok) throw new ProfileImageUpstreamError(`Profile image upstream request failed (HTTP ${response.status}).`);
	try {
		return await response.json();
	} catch {
		throw new ProfileImageUpstreamError('Profile image upstream returned invalid JSON.');
	}
}

async function image(fetchAsset: Requester, url: string): Promise<Buffer> {
	let response: Response;
	try {
		response = await fetchAsset(url);
	} catch (error) {
		throw upstreamError(error, 'Profile image download');
	}
	if (!response.ok) throw new ProfileImageUpstreamError(`Profile image download failed (HTTP ${response.status}).`);
	const bytes = Buffer.from(await response.arrayBuffer());
	if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
		throw new ProfileImageUpstreamError('Profile image upstream returned invalid PNG data.');
	}
	return bytes;
}

async function downloadAndCache(puuid: string, path: string, dependencies: Dependencies): Promise<Buffer> {
	const fetchAsset = dependencies.request ?? request;
	const headers = dependencies.headers ?? riotHeaders();
	const riotUrl = `https://${RIOT_PLATFORM}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`;
	const summoner = await json(fetchAsset, riotUrl, { headers, timeoutMs: 10_000, maxRetryAfterMs: 5 * 60_000 });
	if (!summoner || typeof summoner !== 'object' || Array.isArray(summoner) ||
		!('profileIconId' in summoner) || typeof summoner.profileIconId !== 'number' ||
		!Number.isSafeInteger(summoner.profileIconId) || summoner.profileIconId < 0) {
		throw new ProfileImageUpstreamError('Riot returned an invalid profile icon ID.');
	}

	const versions = await json(fetchAsset, `${DATA_DRAGON}/api/versions.json`);
	if (!Array.isArray(versions) || typeof versions[0] !== 'string' || !/^\d+\.\d+\.\d+$/.test(versions[0])) {
		throw new ProfileImageUpstreamError('Data Dragon returned an invalid version.');
	}
	const bytes = await image(fetchAsset,
		`${DATA_DRAGON}/cdn/${versions[0]}/img/profileicon/${summoner.profileIconId}.png`);
	await mkdir(dirname(path), { recursive: true });
	const temporaryPath = `${path}.${randomUUID()}.partial`;
	try {
		await writeFile(temporaryPath, bytes);
		await rename(temporaryPath, path);
	} finally {
		await rm(temporaryPath, { force: true });
	}
	return bytes;
}

function imageResponse(bytes: Buffer, stale = false): Response {
	const headers = new Headers({
		'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
		'Content-Type': 'image/png',
		'X-Content-Type-Options': 'nosniff',
	});
	if (stale) headers.set('Warning', '110 - "Response is stale"');
	return new Response(new Uint8Array(bytes), { headers });
}

export async function getProfileImage(
	database: Database.Database,
	puuid: string,
	dependencies: Dependencies = {},
): Promise<Response | null> {
	if (!isPuuid(puuid) || !database.prepare('SELECT 1 FROM players WHERE puuid = ?').get(puuid)) return null;

	const path = profileImageCachePath(puuid, dependencies.cacheDirectory);
	const cached = await cachedImage(path);
	const now = dependencies.now ?? Date.now;
	if (cached && now() - cached.updatedAt < MAX_AGE_MS) return imageResponse(cached.bytes);

	let refresh = refreshes.get(path);
	if (!refresh) {
		refresh = downloadAndCache(puuid, path, dependencies);
		refreshes.set(path, refresh);
		void refresh.finally(() => refreshes.delete(path)).catch(() => {});
	}
	try {
		return imageResponse(await refresh);
	} catch (error) {
		if (cached && error instanceof ProfileImageUpstreamError) return imageResponse(cached.bytes, true);
		throw error;
	}
}
