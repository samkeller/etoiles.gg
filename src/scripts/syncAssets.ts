import 'dotenv/config';
import { db } from '../lib/db/db';
import { riotHeaders } from '../lib/riot';
import { syncAssets } from './syncAssetsBackend';
import { log } from './log';

try {
	const result = await syncAssets(db, { headers: riotHeaders() });
	for (const failure of result.failures) log.error(failure);
	if (result.failures.length) {
		process.exitCode = 1;
	} else {
		log.done(1, 'Assets synchronisés', `${result.saved} fichiers`);
	}
} catch (error) {
	log.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
} finally {
	db.close();
}
