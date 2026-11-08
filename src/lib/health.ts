import type Database from 'better-sqlite3';
import { json } from './http';

export function healthResponse(database: Database.Database): Response {
	try {
		database.prepare('SELECT COUNT(*) FROM players').get();
		// A read alone would report a read-only or unwritable volume as ready.
		database.prepare('UPDATE ingest_lock SET expires_at = expires_at WHERE id = 1').run();
		const response = json({ status: 'ok' });
		response.headers.set('Cache-Control', 'no-store');
		return response;
	} catch (error) {
		console.error('Healthcheck database failure:', error);
		const response = json({ status: 'unavailable' }, 503);
		response.headers.set('Cache-Control', 'no-store');
		return response;
	}
}
