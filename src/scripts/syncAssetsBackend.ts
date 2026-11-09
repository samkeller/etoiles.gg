import type Database from 'better-sqlite3';
import { mkdir, rename, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { request, type RequestOptions } from '../lib/backendHttp';
import { championId } from '../lib/lol';
import { profileImageCachePath } from '../lib/profile-images';
import { riotHeaders } from '../lib/riot';

const DD_BASE = 'https://ddragon.leagueoflegends.com';
type AssetEntry = { id: string; name: string };

async function save(path: string, data: string | Buffer) {
	await mkdir(dirname(path), { recursive: true });
	const partial = `${path}.${process.pid}.partial`;
	try {
		await writeFile(partial, data);
		await rename(partial, path);
	} finally {
		await rm(partial, { force: true });
	}
}

function dictionary(value: unknown): AssetEntry[] {
	if (!value || typeof value !== 'object' || !('data' in value) || !value.data || typeof value.data !== 'object' || Array.isArray(value.data)) {
		throw new Error('Invalid Data Dragon dictionary');
	}
	const entries = Object.values(value.data);
	if (!entries.length || entries.some((entry) => !entry || typeof entry.id !== 'string' || !entry.id || typeof entry.name !== 'string' || !entry.name)) {
		throw new Error('Invalid Data Dragon entries');
	}
	return entries;
}

export async function syncAssets(database: Database.Database, dependencies: {
	request?: (url: string, options?: RequestOptions) => Promise<Response>;
	save?: (path: string, data: string | Buffer) => Promise<void>;
	headers?: Record<string, string>;
	profileCacheDirectory?: string;
} = {}) {
	const fetchAsset = dependencies.request ?? request;
	const write = dependencies.save ?? save;
	const failures: string[] = [];
	let saved = 0;
	const attempt = async (label: string, operation: () => Promise<void>) => {
		try { await operation(); } catch (error) { failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`); }
	};
	const json = async (url: string, headers?: Record<string, string>): Promise<unknown> => {
		const response = await fetchAsset(url, { headers });
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return response.json();
	};
	const image = async (url: string, path: string) => {
		const response = await fetchAsset(url);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const bytes = Buffer.from(await response.arrayBuffer());
		if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Invalid PNG response');
		await write(path, bytes);
		saved++;
	};
	let version: string | undefined;
	await attempt('Data Dragon versions', async () => {
		const versions = await json(`${DD_BASE}/api/versions.json`);
		if (!Array.isArray(versions) || typeof versions[0] !== 'string' || !/^\d+\.\d+\.\d+$/.test(versions[0])) {
			throw new Error('Invalid Data Dragon version');
		}
		version = versions[0];
	});
	if (!version) return { saved, failures };
	const cdn = `${DD_BASE}/cdn/${version}`;
	const champions = database.prepare(`SELECT DISTINCT json_extract(participant.value, '$.championName') AS champion
		FROM matches, json_each(matches.raw_json, '$.info.participants') AS participant
		WHERE matches.raw_json IS NOT NULL`).all() as { champion: string | null }[];
	for (const name of new Set(champions.filter((row) => typeof row.champion === 'string').map((row) => championId(row.champion!)))) {
		await attempt(`Champion ${name}`, async () => {
			if (!/^[A-Za-z0-9]+$/.test(name)) throw new Error('Invalid champion identifier');
			await image(`${cdn}/img/champion/${name}.png`, join('public', 'riot', 'champions', `${name}.png`));
		});
	}
	await attempt('French champion names', async () => {
		const entries = dictionary(await json(`${cdn}/data/fr_FR/champion.json`));
		await write(join('src', 'lib', 'lol', 'champion-names.json'),
			`${JSON.stringify(Object.fromEntries(entries.sort((a, b) => a.id.localeCompare(b.id)).map(({ id, name }) => [id, name])), null, '\t')}\n`);
		saved++;
	});
	const players = database.prepare('SELECT puuid FROM players').all() as { puuid: string }[];
	for (const { puuid } of players) {
		await attempt(`Profile ${puuid.slice(0, 8)}`, async () => {
			if (!/^[A-Za-z0-9_-]+$/.test(puuid)) throw new Error('Invalid PUUID');
			const summoner = await json(`https://euw1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`,
				dependencies.headers ?? riotHeaders());
			if (!summoner || typeof summoner !== 'object' || !('profileIconId' in summoner) ||
				typeof summoner.profileIconId !== 'number' || !Number.isInteger(summoner.profileIconId) || summoner.profileIconId < 0) {
				throw new Error('Invalid summoner response');
			}
			await image(`${cdn}/img/profileicon/${summoner.profileIconId}.png`,
				profileImageCachePath(puuid, dependencies.profileCacheDirectory));
		});
	}
	return { saved, failures };
}
