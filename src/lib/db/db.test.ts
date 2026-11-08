import { expect, it, vi } from 'vitest';
import { resolve } from 'node:path';

it('initializes the embedded schema independently of the working directory', async () => {
	const cwd = process.cwd();
	vi.stubEnv('DATABASE_PATH', ':memory:');
	try {
		process.chdir(resolve(cwd, 'src'));
		const { db } = await import('./db');
		try {
			expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'matches'").get()).toEqual({ name: 'matches' });
		} finally { db.close(); }
	} finally {
		process.chdir(cwd);
		vi.unstubAllEnvs();
	}
});
