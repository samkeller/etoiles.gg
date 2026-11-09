import * as riot from '../lib/riot';
import { db } from '../lib/db/db';
import { log } from './log';
import { ingest } from './ingestBackend';
import { acquireIngestLock } from '../lib/ingest-lock';

let lock: ReturnType<typeof acquireIngestLock> | undefined;
let heartbeat: ReturnType<typeof setInterval> | undefined;
const startedAt = Date.now();
function interrupted() {
	log.error('Ingestion interrupted by server shutdown');
	if (heartbeat) clearInterval(heartbeat);
	try {
		if (lock) {
			db.prepare('INSERT INTO ingest_runs (started_at, finished_at, new_matches, status) VALUES (?, ?, ?, ?)')
				.run(startedAt, Date.now(), 0, 'failed');
			lock.release();
		}
	} finally {
		db.close();
		process.exit(1);
	}
}
process.on('SIGTERM', interrupted);
process.on('SIGINT', interrupted);
try {
	lock = acquireIngestLock(db);
	const activeLock = lock;
	heartbeat = setInterval(() => {
		try {
			activeLock.renew();
		} catch (error) {
			log.error(error instanceof Error ? error.message : String(error));
			// Exit immediately: this process no longer owns the right to ingest.
			process.exit(1);
		}
	}, 30_000);
	riot.riotHeaders();
	const backfill = process.argv.includes('--backfill');
	const result = await ingest(db, riot, backfill);
	for (const failure of result.failures) log.error(failure);
	log.info(`File d’attente : ${result.pendingRemaining} match${result.pendingRemaining === 1 ? '' : 's'} restant${result.pendingRemaining === 1 ? '' : 's'}.`);
	if (result.failures.length) {
		process.exitCode = 1;
	} else {
		log.done(1, backfill ? 'Lot de backfill' : 'Ingestion', `${result.newMatches} nouveaux matchs d’équipe`);
	}
} catch (error) {
	if (lock) {
		db.prepare('INSERT INTO ingest_runs (started_at, finished_at, new_matches, status) VALUES (?, ?, ?, ?)')
			.run(startedAt, Date.now(), 0, 'failed');
	}
	log.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
} finally {
	if (heartbeat) clearInterval(heartbeat);
	process.off('SIGTERM', interrupted);
	process.off('SIGINT', interrupted);
	try {
		lock?.release();
	} finally {
		db.close();
	}
}
