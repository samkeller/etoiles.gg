import { performance } from 'node:perf_hooks';
import { strict as assert } from 'node:assert';
import type Database from 'better-sqlite3';
import { closeTestDatabases, createTestDatabase, seedRankedHistory } from '../lib/stats/fixtures';
import { clearReadCache, MAX_READ_CACHE_CHARACTERS, readCacheMetrics } from '../lib/stats/cache';
import { getCollective, getDraftHistory, getIndividualProfiles, getMatches, getOverview, getPlayers, getSessionHistory, getTeamBans, getTeamStories, getDiscoveries } from '../lib/stats';

const paths: Record<string, (database: Database.Database) => unknown> = {
	accueil: (database) => ({
		overview: getOverview(database),
		players: getPlayers(database),
		full: getMatches(database),
		partial: getMatches(database, 'partial'),
		sessions: getSessionHistory(database),
		collective: getCollective(database),
		stories: getTeamStories(database),
		discoveries: getDiscoveries(database),
	}),
	profil: (database) => ({
		personal: getIndividualProfiles(database).find((player) => player.puuid === 'player-0'),
		team: getPlayers(database).find((player) => player.puuid === 'player-0'),
		moments: getTeamStories(database).events.filter((moment) => moment.puuid === 'player-0'),
		discoveries: getDiscoveries(database).filter((discovery) => discovery.puuid === 'player-0'),
	}),
	memoire: (database) => ({
		full: getMatches(database),
		partial: getMatches(database, 'partial'),
		sessions: getSessionHistory(database),
		stories: getTeamStories(database),
	}),
	draft: (database) => ({
		personal: getIndividualProfiles(database),
		players: getPlayers(database),
		history: getDraftHistory(database),
		bans: getTeamBans(database),
	}),
};

function median(samples: number[]): number {
	const sorted = [...samples].sort((left, right) => left - right);
	return sorted[Math.floor(sorted.length / 2)];
}

function measure(run: () => unknown, iterations: number): number {
	const samples: number[] = [];
	for (let iteration = 0; iteration < iterations; iteration += 1) {
		const startedAt = performance.now();
		run();
		samples.push(performance.now() - startedAt);
	}
	return median(samples);
}

try {
	const requested = process.argv.slice(2);
	const sizes = requested.length ? requested.map(Number) : [100, 1000, 5000];
	if (sizes.some((size) => !Number.isSafeInteger(size) || size <= 0 || size > 50000)) {
		throw new Error('Usage: npm run stats:benchmark -- [match counts between 1 and 50000]');
	}
	console.log('Synthetic ranked histories; median data-layer time, not full HTTP/render latency.');
	console.log('Acceptance: identical outputs, bounded payload, at least 2x faster warm reads at 1000+ matches.');
	const rows = [];
	for (const size of sizes) {
		const database = createTestDatabase();
		seedRankedHistory(database, size);
		for (const [path, read] of Object.entries(paths)) {
			const baseline = () => database.transaction(() => read(database))();
			const expected = JSON.stringify(baseline());
			const baselineMs = measure(baseline, 5);
			const coldMs = measure(() => {
				clearReadCache(database);
				return read(database);
			}, 5);
			assert.equal(JSON.stringify(read(database)), expected, `${path}: cold output changed`);
			const warmMs = measure(() => read(database), 20);
			assert.equal(JSON.stringify(read(database)), expected, `${path}: warm output changed`);
			const metrics = readCacheMetrics(database);
			assert.ok(metrics.characters <= MAX_READ_CACHE_CHARACTERS, 'Cache exceeded its payload bound');
			if (size >= 1000) assert.ok(warmMs <= baselineMs / 2, `${path}: warm reads did not reach 2x speedup`);
			rows.push({
				matches: size,
				path,
				uncachedMs: Number(baselineMs.toFixed(2)),
				coldMs: Number(coldMs.toFixed(2)),
				warmMs: Number(warmMs.toFixed(2)),
				speedup: Number((baselineMs / warmMs).toFixed(1)),
				retainedMiChars: Number((metrics.characters / 1024 / 1024).toFixed(2)),
			});
		}
	}
	console.table(rows);
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
} finally {
	closeTestDatabases();
}
