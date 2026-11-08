import type Database from 'better-sqlite3';

interface Run {
	startedAt: number;
	finishedAt: number | null;
	newMatches: number;
	status: 'ok' | 'failed';
}

export function getSyncStatus(database: Database.Database, now = Date.now()) {
	const lastAttempt = database.prepare(`SELECT started_at AS startedAt, finished_at AS finishedAt,
		new_matches AS newMatches, status FROM ingest_runs ORDER BY started_at DESC, rowid DESC LIMIT 1`)
		.get() as Run | undefined;
	const lastSuccess = database.prepare(`SELECT started_at AS startedAt, finished_at AS finishedAt,
		new_matches AS newMatches, status FROM ingest_runs WHERE status = 'ok'
		ORDER BY started_at DESC, rowid DESC LIMIT 1`).get() as Run | undefined;
	const pending = database.prepare('SELECT COUNT(*) AS count FROM ingest_pending').get() as { count: number };
	const lease = database.prepare('SELECT expires_at AS expiresAt FROM ingest_lock WHERE id = 1')
		.get() as { expiresAt: number } | undefined;
	const running = lease !== undefined && lease.expiresAt > now;
	const successAt = lastSuccess ? lastSuccess.finishedAt ?? lastSuccess.startedAt : null;
	return {
		state: running ? 'running' as const : lease ? 'interrupted' as const : lastAttempt?.status ?? 'never' as const,
		lastAttempt: lastAttempt ?? null,
		lastSuccess: lastSuccess ?? null,
		pendingMatches: pending.count,
		stale: successAt === null || now - successAt > 48 * 60 * 60 * 1000,
	};
}
