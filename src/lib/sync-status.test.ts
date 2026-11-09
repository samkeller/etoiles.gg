import { afterEach, expect, it } from 'vitest';
import { closeTestDatabases, createTestDatabase } from './stats/fixtures';
import { getSyncStatus } from './sync-status';
import { acquireIngestLock } from './ingest-lock';

afterEach(closeTestDatabases);

it('distinguishes a never-synchronized database from a successful empty run', () => {
	const database = createTestDatabase();
	expect(getSyncStatus(database, 1000)).toMatchObject({ state: 'never', lastSuccess: null, stale: true });
	database.prepare("INSERT INTO ingest_runs (started_at, finished_at, new_matches, status) VALUES (1000, 2000, 0, 'ok')").run();
	expect(getSyncStatus(database, 3000)).toMatchObject({ state: 'ok', stale: false, lastSuccess: { newMatches: 0 } });
});

it('keeps last success after a failed run and reports pending matches and staleness', () => {
	const database = createTestDatabase();
	database.prepare("INSERT INTO ingest_runs (started_at, finished_at, new_matches, status) VALUES (1000, 2000, 3, 'ok'), (3000, 4000, 1, 'failed')").run();
	database.prepare("INSERT INTO ingest_pending (match_id) VALUES ('EUW1_1')").run();
	expect(getSyncStatus(database, 4000)).toMatchObject({
		state: 'failed', lastSuccess: { finishedAt: 2000 }, pendingMatches: 1, stale: false,
	});
	expect(getSyncStatus(database, 2000 + 48 * 60 * 60 * 1000)).toHaveProperty('stale', false);
	expect(getSyncStatus(database, 2001 + 48 * 60 * 60 * 1000)).toHaveProperty('stale', true);
});

it('shows running only while a lease is active, without exposing its owner', () => {
	const database = createTestDatabase();
	acquireIngestLock(database, 1000);
	expect(getSyncStatus(database, 2000).state).toBe('running');
	expect(getSyncStatus(database, 1_000_000).state).toBe('interrupted');
	expect(JSON.stringify(getSyncStatus(database, 2000))).not.toContain('owner');
});

it('uses the start date of legacy runs with no finish timestamp', () => {
	const database = createTestDatabase();
	database.prepare("INSERT INTO ingest_runs (started_at, new_matches, status) VALUES (1000, 0, 'ok')").run();
	expect(getSyncStatus(database, 2000)).toMatchObject({ stale: false, lastSuccess: { finishedAt: null } });
});
