import { describe, expect, it } from 'vitest';
import { formatDuration, formatKdaIndicator, formatSince, recordTip } from './format';

const DAY = 86_400_000;

describe('stat formatting', () => {
	it('formats duration as minutes and padded seconds', () => {
		expect(formatDuration(1991)).toBe('33:11');
		expect(formatDuration(60)).toBe('1:00');
	});
	it('uses the shared KDA definition and French decimals', () => {
		expect(formatKdaIndicator(4, 0, 8)).toBe('12');
		expect(formatKdaIndicator(1, 3, 4)).toBe('1,67');
	});
	it('describes elapsed time with a coarse relative unit', () => {
		const now = 100 * DAY;
		expect(formatSince(now - DAY, now)).toBe('hier');
		expect(formatSince(now - 14 * DAY, now)).toBe('il y a 2 semaines');
		expect(formatSince(now - 90 * DAY, now)).toBe('il y a 3 mois');
	});
	it('only shows a win rate once the sample reaches the threshold', () => {
		expect(recordTip({ games: 3, wins: 2 }, 5)).toBe('3 parties · 2 V – 1 D');
		expect(recordTip({ games: 5, wins: 3, kda: 2.5, lastPlayedAt: 99 * DAY }, 5, 100 * DAY))
			.toBe('5 parties · 3 V – 2 D\n60\u00a0% de victoires\nKDA 2,5\nDernière : hier');
	});
});
