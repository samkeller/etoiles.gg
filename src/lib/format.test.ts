import { describe, expect, it } from 'vitest';
import { formatDuration, formatKdaIndicator } from './format';

describe('stat formatting', () => {
	it('formats duration as minutes and padded seconds', () => {
		expect(formatDuration(1991)).toBe('33:11');
		expect(formatDuration(60)).toBe('1:00');
	});
	it('uses the shared KDA definition and French decimals', () => {
		expect(formatKdaIndicator(4, 0, 8)).toBe('12');
		expect(formatKdaIndicator(1, 3, 4)).toBe('1,67');
	});
});
