export interface RequestOptions {
	headers?: Record<string, string>;
	timeoutMs?: number;
	maxRetries?: number;
	sleep?: (ms: number) => Promise<void>;
}

/** Retry transient errors only; a request can never wait indefinitely. */
export async function request(url: string, options: RequestOptions = {}): Promise<Response> {
	const { timeoutMs = 10_000, maxRetries = 3, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = options;
	for (let attempt = 0; ; attempt++) {
		let response: Response;
		try {
			response = await fetch(url, { headers: options.headers, signal: AbortSignal.timeout(timeoutMs) });
		} catch (error) {
			if (attempt >= maxRetries) throw error;
			await sleep(Math.min(1000 * 2 ** attempt, 30_000));
			continue;
		}
		if (response.ok) return response;
		if (attempt >= maxRetries || (response.status !== 429 && response.status < 500)) {
			throw new Error(`HTTP ${response.status} for ${new URL(url).pathname}`);
		}
		const retryAfter = response.headers.get('retry-after');
		const seconds = retryAfter === null ? NaN : Number(retryAfter);
		const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter ?? '') - Date.now();
		await response.body?.cancel();
		if (Number.isFinite(delay) && delay > 30_000) {
			throw new Error(`HTTP ${response.status}: Retry-After exceeds the 30s wait limit`);
		}
		await sleep(Math.max(0, Math.min(Number.isFinite(delay) ? delay : 1000 * 2 ** attempt, 30_000)));
	}
}
