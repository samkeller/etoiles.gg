import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';

const DB_PATH = process.env.DATABASE_PATH ?? './etoiles.db';

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // lectures concurrentes pendant les writes
db.exec(readFileSync('./src/lib/db/schema.sql', 'utf-8'));