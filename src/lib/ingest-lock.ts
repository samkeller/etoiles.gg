import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export const INGEST_LEASE_MS = 5 * 60 * 1000;

export function acquireIngestLock(database: Database.Database, now = Date.now()) {
	const owner = randomUUID();
	const result = database.prepare(`INSERT INTO ingest_lock (id, owner, expires_at) VALUES (1, ?, ?)
		ON CONFLICT(id) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at
		WHERE ingest_lock.expires_at <= ?`).run(owner, now + INGEST_LEASE_MS, now);
	if (!result.changes) throw new Error('An ingestion is already running; retry later');
	return {
		renew(timestamp = Date.now()) {
			const renewal = database.prepare('UPDATE ingest_lock SET expires_at = ? WHERE id = 1 AND owner = ? AND expires_at > ?')
				.run(timestamp + INGEST_LEASE_MS, owner, timestamp);
			if (!renewal.changes) throw new Error('Ingestion lock lost; stopping to avoid concurrent writes');
		},
		release() {
			database.prepare('DELETE FROM ingest_lock WHERE id = 1 AND owner = ?').run(owner);
		},
	};
}
