import { afterEach, expect, it, vi } from 'vitest';
import { closeTestDatabases, createTestDatabase } from './stats/fixtures';
import { healthResponse } from './health';

afterEach(() => { closeTestDatabases(); vi.restoreAllMocks(); });

it('is ready with writable storage even before roster or ingestion setup', async () => {
	const response = healthResponse(createTestDatabase());
	expect(response.status).toBe(200);
	expect(response.headers.get('Cache-Control')).toBe('no-store');
	expect(await response.json()).toEqual({ status: 'ok' });
});

it('reports unavailable storage explicitly without exposing paths', async () => {
	const database = createTestDatabase();
	database.pragma('query_only = ON');
	const error = vi.spyOn(console, 'error').mockImplementation(() => {});
	const response = healthResponse(database);
	expect(response.status).toBe(503);
	expect(error).toHaveBeenCalled();
	expect(await response.json()).toEqual({ status: 'unavailable' });
});
