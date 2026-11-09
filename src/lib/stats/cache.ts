import type Database from 'better-sqlite3';

export const MAX_READ_CACHE_CHARACTERS = 16 * 1024 * 1024;
export const MAX_READ_CACHE_ENTRIES = 16;

interface ReadCache {
	version: number | null;
	entries: Map<string, string>;
	characters: number;
	hits: number;
	misses: number;
	reading: boolean;
}

const caches = new WeakMap<Database.Database, ReadCache>();

function cacheFor(database: Database.Database): ReadCache {
	let cache = caches.get(database);
	if (!cache) {
		cache = { version: null, entries: new Map(), characters: 0, hits: 0, misses: 0, reading: false };
		caches.set(database, cache);
	}
	return cache;
}

export function clearReadCache(database: Database.Database): void {
	caches.delete(database);
}

export function readCacheMetrics(database: Database.Database) {
	const { version, characters, hits, misses, entries } = cacheFor(database);
	return { version, characters, hits, misses, entries: entries.size };
}

/** Cache JSON-shaped summaries only; callers always receive their own mutable result. */
export function cachedRead<T>(database: Database.Database, key: string, compute: () => T): T {
	const cache = cacheFor(database);
	// Never publish results of an external write transaction that might roll back.
	if (database.inTransaction && !cache.reading) return compute();
	const read = (): T => {
		const row = database.prepare('SELECT version FROM data_revision WHERE id = 1').get() as { version: number } | undefined;
		if (!row || !Number.isSafeInteger(row.version) || row.version < 0) {
			throw new Error('Invalid statistics data revision.');
		}
		if (cache.version !== row.version) {
			cache.entries.clear();
			cache.characters = 0;
			cache.version = row.version;
		}
		const existing = cache.entries.get(key);
		if (existing !== undefined) {
			cache.hits += 1;
			cache.entries.delete(key);
			cache.entries.set(key, existing);
			return JSON.parse(existing) as T;
		}
		cache.misses += 1;
		const value = compute();
		const serialized = JSON.stringify(value);
		if (serialized === undefined) throw new Error(`Statistics cache entry ${key} is not JSON serializable.`);
		if (serialized.length <= MAX_READ_CACHE_CHARACTERS) {
			while (cache.entries.size && (
				cache.characters + serialized.length > MAX_READ_CACHE_CHARACTERS ||
				cache.entries.size >= MAX_READ_CACHE_ENTRIES
			)) {
				const oldest = cache.entries.keys().next().value!;
				cache.characters -= cache.entries.get(oldest)!.length;
				cache.entries.delete(oldest);
			}
			cache.entries.set(key, serialized);
			cache.characters += serialized.length;
		}
		return value;
	};
	if (cache.reading) return read();
	return database.transaction(() => {
		cache.reading = true;
		try {
			return read();
		} finally {
			cache.reading = false;
		}
	})();
}
