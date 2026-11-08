import 'dotenv/config';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { migrateDatabase } from './migrations';
import { SCHEMA } from './schema';

export function openDatabase(path = process.env.DATABASE_PATH ?? './etoiles.db'): Database.Database {
	if (!path.trim()) throw new Error('DATABASE_PATH must not be empty');
	const mount = process.env.RAILWAY_VOLUME_MOUNT_PATH;
	if (process.env.RAILWAY_ENVIRONMENT_ID && !mount) throw new Error('Railway requires a persistent volume');
	if (mount) {
		if (!existsSync(mount)) throw new Error('Railway volume is not mounted');
		const location = relative(realpathSync(mount), resolve(path));
		if (!isAbsolute(path) || location === '..' || location.startsWith(`..${sep}`) || isAbsolute(location)) {
			throw new Error('DATABASE_PATH must be inside the Railway volume');
		}
	}
	if (path !== ':memory:') {
		mkdirSync(dirname(resolve(path)), { recursive: true });
		if (mount) {
			const location = relative(realpathSync(mount), realpathSync(dirname(resolve(path))));
			if (location === '..' || location.startsWith(`..${sep}`) || isAbsolute(location)) {
				throw new Error('DATABASE_PATH parent escapes the Railway volume');
			}
		}
	} else if (process.env.NODE_ENV === 'production') {
		throw new Error('Production requires a persistent DATABASE_PATH');
	}
	const database = new Database(path);
	try {
		database.pragma('busy_timeout = 5000');
		database.pragma('journal_mode = WAL');
		database.exec(SCHEMA);
		migrateDatabase(database);
		const columns = database.pragma('table_info(ingest_runs)') as { name: string }[];
		if (!columns.some(column => column.name === 'finished_at')) {
			database.exec('ALTER TABLE ingest_runs ADD COLUMN finished_at INTEGER');
		}
		return database;
	} catch (error) {
		database.close();
		throw error;
	}
}
