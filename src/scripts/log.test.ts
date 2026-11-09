import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	vi.useRealTimers();
	vi.resetModules();
});

it('timestamps messages and preserves numbered step formatting', async () => {
	vi.stubEnv('LOG_LEVEL', 'info');
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
	const output = vi.spyOn(console, 'log').mockImplementation(() => {});
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const { log } = await import('./log');
	log.info('progress');
	log.step(1, 'Collecte');
	log.done(1, 'Collecte', '10 matchs');
	log.error('failure');
	expect(output.mock.calls[0]).toEqual(['[2026-01-01T12:00:00.000Z] progress']);
	expect(output.mock.calls[1][0]).toContain('── 1. Collecte');
	expect(output.mock.calls[2][0]).toContain('✓ 1. Collecte — 10 matchs');
	expect(errors.mock.calls[0][0]).toContain('[2026-01-01T12:00:00.000Z] ✗ failure');
});

it('keeps errors visible in silent mode', async () => {
	vi.stubEnv('LOG_LEVEL', 'silent');
	const output = vi.spyOn(console, 'log').mockImplementation(() => {});
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const { log } = await import('./log');
	log.info('hidden');
	log.step(1, 'hidden');
	log.done(1, 'hidden', 'hidden');
	log.error('visible');
	expect(output).not.toHaveBeenCalled();
	expect(errors).toHaveBeenCalledOnce();
});
