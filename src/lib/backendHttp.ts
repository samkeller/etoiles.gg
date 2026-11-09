export interface RequestOptions {
	headers?: Record<string, string>;
	timeoutMs?: number;
	maxRetries?: number;
	maxRetryAfterMs?: number;
	sleep?: (ms: number) => Promise<void>;
	onRetry?: (retry: { attempt: number; maxRetries: number; delayMs: number; reason: string }) => void;
}

export class RateLimitError extends Error {
	constructor(message: string, public readonly retryAfterMs?: number) { super(message); }
}
export class HttpError extends Error {
	constructor(public readonly status: number, message: string) { super(message); }
}

export function deferredRetryDelay(error: unknown, attempts: number): number {
	const base = error instanceof RateLimitError ? 15 * 60_000 : 60_000;
	const backoff = Math.min(base * 2 ** Math.min(attempts, 8), 6 * 60 * 60_000);
	return Math.max(backoff, error instanceof RateLimitError ? error.retryAfterMs ?? 0 : 0);
}

/** Retry transient errors only; a request can never wait indefinitely. */
export async function request(url: string, options: RequestOptions = {}): Promise<Response> {
	const { timeoutMs = 10_000, maxRetries = 3, maxRetryAfterMs = 30_000,
		sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = options;
	for (let attempt = 0; ; attempt++) {
		let response: Response;
		try {
			response = await fetch(url, { headers: options.headers, signal: AbortSignal.timeout(timeoutMs) });
		} catch (error) {
			if (attempt >= maxRetries) throw error;
			const delayMs = Math.min(1000 * 2 ** attempt, 30_000);
			options.onRetry?.({ attempt: attempt + 1, maxRetries, delayMs,
				reason: error instanceof Error ? error.name : 'NetworkError' });
			await sleep(delayMs);
			continue;
		}
		if (response.ok) return response;
		const retryAfter = response.headers.get('retry-after');
		const seconds = retryAfter === null ? NaN : Number(retryAfter);
		const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter ?? '') - Date.now();
		const retryAfterMs = Number.isFinite(delay) ? Math.max(0, delay) : undefined;
		if (attempt >= maxRetries || (response.status !== 429 && response.status < 500)) {
			const message = `HTTP ${response.status} for ${new URL(url).pathname}`;
			if (response.status === 429) throw new RateLimitError(message, retryAfterMs);
			throw new HttpError(response.status, message);
		}
		await response.body?.cancel();
		if (Number.isFinite(delay) && delay > maxRetryAfterMs) {
			const message = `HTTP ${response.status}: Retry-After ${Math.ceil(delay / 1000)}s exceeds the ${maxRetryAfterMs / 1000}s wait limit`;
			if (response.status === 429) throw new RateLimitError(message, retryAfterMs);
			throw new Error(message);
		}
		const delayMs = Math.max(0, Math.min(Number.isFinite(delay) ? delay : 1000 * 2 ** attempt, maxRetryAfterMs));
		options.onRetry?.({ attempt: attempt + 1, maxRetries, delayMs, reason: `HTTP ${response.status}` });
		await sleep(delayMs);
	}
}
