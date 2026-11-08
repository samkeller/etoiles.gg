import * as riot from '../lib/riot';
import { db } from '../lib/db/db';
import { log } from './log';
import { ingest } from './ingestBackend';

try {
	riot.riotHeaders();
	const result = await ingest(db, riot, process.argv.includes('--backfill'));
	for (const failure of result.failures) log.error(failure);
	if (result.failures.length) {
		process.exitCode = 1;
	} else {
		log.done(1, 'Ingestion', `${result.newMatches} nouveaux matchs d’équipe`);
	}
} catch (error) {
	db.prepare('INSERT INTO ingest_runs (started_at, new_matches, status) VALUES (?, ?, ?)')
		.run(Date.now(), 0, 'failed');
	log.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
} finally {
	db.close();
}
