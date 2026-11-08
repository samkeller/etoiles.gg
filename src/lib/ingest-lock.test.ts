import { afterEach, expect, it } from 'vitest';
import { acquireIngestLock, INGEST_LEASE_MS } from './ingest-lock';
import { closeTestDatabases, createTestDatabase } from './stats/fixtures';

afterEach(closeTestDatabases);

it('rejects overlapping manual and scheduled runs and allows release', () => {
	const database = createTestDatabase();
	const lock = acquireIngestLock(database, 1000);
	expect(() => acquireIngestLock(database, 1001)).toThrow('already running');
	lock.release();
	const next = acquireIngestLock(database, 1002);
	next.release();
});

it('renews the lease and permits recovery after a crashed process', () => {
	const database = createTestDatabase();
	const old = acquireIngestLock(database, 1000);
	old.renew(2000);
	expect(() => acquireIngestLock(database, 1000 + INGEST_LEASE_MS)).toThrow('already running');
	const next = acquireIngestLock(database, 2000 + INGEST_LEASE_MS);
	expect(() => old.renew(2000 + INGEST_LEASE_MS)).toThrow('lock lost');
	old.release();
	expect(() => acquireIngestLock(database, 3000 + INGEST_LEASE_MS)).toThrow('already running');
	next.release();
});

it('cannot revive an expired lease without reacquiring', () => {
	const database = createTestDatabase();
	const lock = acquireIngestLock(database, 1000);
	expect(() => lock.renew(1000 + INGEST_LEASE_MS)).toThrow('lock lost');
});
