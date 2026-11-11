import { describe, expect, it, vi } from 'vitest';
import { getBackHref, navigateBack } from './navigation';

const current = 'https://etoiles.test/matches/EUW1_42';

function context(referrer: string, length = 2) {
	return {
		location: { href: current, assign: vi.fn() },
		history: { length, back: vi.fn() },
		document: { referrer },
	};
}

describe('getBackHref', () => {
	it('preserves the source page, draft picks, filters and anchor', () => {
		expect(getBackHref('https://etoiles.test/draft?picks=Jax,,Ahri,,#compositions-title', current))
			.toBe('/draft?picks=Jax,,Ahri,,#compositions-title');
		expect(getBackHref('https://etoiles.test/history?year=2026', current)).toBe('/history?year=2026');
		expect(getBackHref('https://etoiles.test/players/player-0', current)).toBe('/players/player-0');
	});

	it.each(['', 'invalid', 'https://external.test/draft', 'javascript:alert(1)', current])(
		'falls back for an absent, invalid, external or identical source: %s', (referrer) => {
			expect(getBackHref(referrer, current)).toBe('/history');
		},
	);

	it('does not turn a same-origin path starting with two slashes into an external URL', () => {
		const destination = getBackHref('https://etoiles.test//external.test/path', current);
		expect(new URL(destination, current).origin).toBe('https://etoiles.test');
	});
});

describe('navigateBack', () => {
	it('uses browser history to restore the previous draft entry and scroll', () => {
		const browser = context('https://etoiles.test/draft?picks=Jax,,Ahri,,');
		navigateBack('/history', browser);
		expect(browser.history.back).toHaveBeenCalledOnce();
		expect(browser.location.assign).not.toHaveBeenCalled();
	});

	it('returns to the source URL when the match was opened in a new tab', () => {
		const browser = context('https://etoiles.test/draft?picks=Jax,,,,', 1);
		navigateBack('/history', browser);
		expect(browser.history.back).not.toHaveBeenCalled();
		expect(browser.location.assign).toHaveBeenCalledWith('/draft?picks=Jax,,,,');
	});

	it('uses history even when the previous page has the same URL as the fallback', () => {
		const browser = context('https://etoiles.test/history');
		navigateBack('/history', browser);
		expect(browser.history.back).toHaveBeenCalledOnce();
		expect(browser.location.assign).not.toHaveBeenCalled();
	});

	it.each(['', 'https://external.test/'])('uses a safe fallback for a direct or external visit', (referrer) => {
		const browser = context(referrer);
		navigateBack('/history', browser);
		expect(browser.history.back).not.toHaveBeenCalled();
		expect(browser.location.assign).toHaveBeenCalledWith('/history');
	});
});
