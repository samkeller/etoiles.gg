import { afterEach, describe, expect, it, vi } from 'vitest';
import { ingestionEnabled, nextIngestionAt, startDailyIngestion } from './schedule';

afterEach(() => vi.useRealTimers());

describe('daily ingestion schedule', () => {
	it.each([
		['2026-11-08T03:59:59.000Z', '2026-11-08T04:00:00.000Z'],
		['2026-11-08T04:00:00.000Z', '2026-11-09T04:00:00.000Z'],
		['2026-11-08T23:59:59.000Z', '2026-11-09T04:00:00.000Z'],
		['2026-12-31T05:00:00.000Z', '2027-01-01T04:00:00.000Z'],
		['2026-03-29T03:00:00.000Z', '2026-03-29T04:00:00.000Z'],
	])('schedules %s at %s regardless of local timezone', (now, expected) => {
		expect(new Date(nextIngestionAt(Date.parse(now))).toISOString()).toBe(expected);
	});

	it('is opt-in and rejects ambiguous configuration', () => {
		vi.stubEnv('INGEST_ENABLED', undefined);
		expect(ingestionEnabled()).toBe(false);
		vi.unstubAllEnvs();
		expect(ingestionEnabled('false')).toBe(false);
		expect(ingestionEnabled('true')).toBe(true);
		expect(() => ingestionEnabled('1')).toThrow('INGEST_ENABLED');
		expect(() => ingestionEnabled('')).toThrow('INGEST_ENABLED');
	});

	it('waits until 04:00 UTC, logs failures and retries the next day, not immediately', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-11-08T03:59:00Z'));
		const run = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('Riot unavailable')).mockResolvedValue();
		const report = vi.fn();
		const failure = vi.fn();
		const stop = startDailyIngestion(run, report, failure);
		expect(run).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(59_999);
		expect(run).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(run).toHaveBeenCalledTimes(1);
		expect(failure).toHaveBeenCalledWith(expect.objectContaining({ message: 'Riot unavailable' }));
		expect(report).toHaveBeenLastCalledWith(Date.parse('2026-11-09T04:00:00Z'));
		await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
		expect(run).toHaveBeenCalledTimes(2);
		stop();
		await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
		expect(run).toHaveBeenCalledTimes(2);
	});

	it('does not overlap a long run or rearm after shutdown during ingestion', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-11-08T03:59:59Z'));
		let finish!: () => void;
		const run = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
		const report = vi.fn();
		const stop = startDailyIngestion(run, report, vi.fn());
		await vi.advanceTimersByTimeAsync(1000);
		await vi.advanceTimersByTimeAsync(48 * 60 * 60 * 1000);
		expect(run).toHaveBeenCalledTimes(1);
		stop();
		finish();
		await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
		expect(report).toHaveBeenCalledTimes(1);
	});
});
