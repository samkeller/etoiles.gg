export function ingestionEnabled(value = process.env.INGEST_ENABLED): boolean {
	if (value === undefined || value === 'false') return false;
	if (value === 'true') return true;
	throw new Error('INGEST_ENABLED must be true or false');
}

export function nextIngestionAt(now = Date.now()): number {
	const next = new Date(now);
	next.setUTCHours(4, 0, 0, 0);
	if (next.getTime() <= now) next.setUTCDate(next.getUTCDate() + 1);
	return next.getTime();
}

export function startDailyIngestion(
	run: () => Promise<void>,
	onScheduled: (timestamp: number) => void,
	onError: (error: unknown) => void,
) {
	let stopped = false;
	let timer: ReturnType<typeof setTimeout>;
	function schedule() {
		if (stopped) return;
		const next = nextIngestionAt();
		onScheduled(next);
		timer = setTimeout(async () => {
			if (stopped) return;
			try {
				await run();
			} catch (error) {
				onError(error);
			} finally {
				schedule();
			}
		}, next - Date.now());
	}
	schedule();
	return () => { stopped = true; clearTimeout(timer); };
}
