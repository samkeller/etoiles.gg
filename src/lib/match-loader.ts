export function createMatchLoader(fetcher: typeof fetch = fetch) {
	const cache = new Map<string, string>();
	let controller: AbortController | null = null;
	let sequence = 0;

	return {
		cancel() {
			sequence += 1;
			controller?.abort();
		},
		async load(id: string): Promise<string | null> {
			controller?.abort();
			const request = ++sequence;
			if (cache.has(id)) return cache.get(id)!;
			const current = new AbortController();
			controller = current;
			try {
				const response = await fetcher(`/partials/matches/${encodeURIComponent(id)}`, { signal: current.signal });
				if (!response.ok) throw new Error(`Chargement du match : HTTP ${response.status}`);
				const html = await response.text();
				if (request !== sequence) return null;
				cache.set(id, html);
				if (cache.size > 40) cache.delete(cache.keys().next().value!);
				return html;
			} catch (error) {
				if (current.signal.aborted || request !== sequence) return null;
				throw error;
			}
		},
	};
}
