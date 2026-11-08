import Database from 'better-sqlite3';
import { SCHEMA } from './schema';

const DB_PATH = process.env.DATABASE_PATH ?? './etoiles.db';

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // lectures concurrentes pendant les writes
db.exec(SCHEMA);