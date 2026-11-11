import { describe, expect, it } from 'vitest';
import { winrateEstimate } from './winrate';

describe('observed winrate and Wilson uncertainty', () => {
	it('distinguishes no observations from an observed 0% winrate', () => {
		expect(winrateEstimate(0, 0)).toBeNull();
		expect(winrateEstimate(0, 1)).toMatchObject({ rate: 0, lower: 0 });
		expect(winrateEstimate(0, 1)!.upper).toBeCloseTo(0.7934506856, 8);
	});

	it('retains uncertainty at 0% and 100% instead of implying certainty', () => {
		const zero = winrateEstimate(0, 5)!;
		const perfect = winrateEstimate(5, 5)!;
		expect(zero.upper).toBeCloseTo(0.4344824648, 8);
		expect(perfect.lower).toBeCloseTo(1 - zero.upper, 10);
		expect(perfect.upper).toBeCloseTo(1, 10);
		expect(perfect.rate).toBe(1);
	});

	it('renders the same observed rate with less uncertainty as the sample grows', () => {
		const small = winrateEstimate(1, 2)!;
		const large = winrateEstimate(50, 100)!;
		expect(small.rate).toBe(large.rate);
		expect(small.lower).toBeCloseTo(0.0945312057, 8);
		expect(small.upper).toBeCloseTo(0.9054687943, 8);
		expect(large.upper - large.lower).toBeLessThan(small.upper - small.lower);
	});

	it.each([[0, -1], [-1, 5], [6, 5], [0.5, 5], [1, 2.5], [NaN, 5], [1, Infinity]])(
		'rejects invalid counts: %s wins in %s games', (wins, games) => {
			expect(() => winrateEstimate(wins, games)).toThrow(RangeError);
		},
	);
});
