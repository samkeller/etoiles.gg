import { describe, expect, it, vi } from 'vitest';
import { createMatchLoader } from './match-loader';

describe('match fragment loading', () => {
	it('reuses successfully loaded fragments', async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('<article>match</article>'));
		const loader = createMatchLoader(fetcher);
		expect(await loader.load('EUW1_1')).toContain('match');
		expect(await loader.load('EUW1_1')).toContain('match');
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('discards an earlier same-id response after closing and reopening', async () => {
		const deferred: ((response: Response) => void)[] = [];
		const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise((resolve) => deferred.push(resolve)));
		const loader = createMatchLoader(fetcher);
		const first = loader.load('EUW1_1');
		loader.cancel();
		const second = loader.load('EUW1_1');
		deferred[1](new Response('new'));
		expect(await second).toBe('new');
		deferred[0](new Response('old'));
		expect(await first).toBeNull();
	});

	it('surfaces failures and permits retry instead of caching errors', async () => {
		const fetcher = vi.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response('', { status: 500 }))
			.mockResolvedValueOnce(new Response('retry'));
		const loader = createMatchLoader(fetcher);
		await expect(loader.load('EUW1_1')).rejects.toThrow('HTTP 500');
		expect(await loader.load('EUW1_1')).toBe('retry');
	});
});
