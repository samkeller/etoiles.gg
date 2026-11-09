import 'dotenv/config';
import { spawn, type ChildProcess } from 'node:child_process';
import { openDatabase } from '../lib/db/open';
import { ingestionEnabled, startDailyIngestion } from '../lib/schedule';
import { riotHeaders } from '../lib/riot';
import { log } from './log';

const enabled = ingestionEnabled();
const database = openDatabase();
try {
	if (enabled) {
		riotHeaders();
		const roster = database.prepare('SELECT COUNT(*) AS count FROM players').get() as { count: number };
		if (roster.count !== 5) throw new Error('Scheduled ingestion requires five configured players');
		if (!database.prepare("SELECT 1 FROM ingest_runs WHERE status = 'ok' LIMIT 1").get()) {
			throw new Error('Scheduled ingestion requires a successful manual ingestion first');
		}
	}
} finally {
	database.close();
}

let stopping = false;
let stopSchedule: (() => void) | undefined;
let killTimer: ReturnType<typeof setTimeout> | undefined;
let ingestion: ChildProcess | undefined;
const server = spawn(process.execPath, ['dist/server/entry.mjs'], {
	stdio: 'inherit',
	env: { ...process.env, HOST: process.env.HOST ?? '0.0.0.0' },
});

function shutdown(code: number) {
	if (stopping) return;
	stopping = true;
	process.exitCode = code;
	stopSchedule?.();
	server.kill('SIGTERM');
	ingestion?.kill('SIGTERM');
	killTimer = setTimeout(() => {
		if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL');
		if (ingestion?.exitCode === null && ingestion.signalCode === null) ingestion.kill('SIGKILL');
	}, 10_000);
	killTimer.unref();
}

server.on('error', error => { log.error(error.message); shutdown(1); });
server.on('exit', (code, signal) => {
	if (!stopping) {
		log.error(`Web server exited: ${signal ?? code}`);
		shutdown(code || 1);
	}
});
process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

function runIngestion(): Promise<void> {
	return new Promise((resolve, reject) => {
		log.info('Scheduled ingestion started');
		ingestion = spawn(process.execPath, ['--import', 'tsx', 'src/scripts/sync.ts', 'update'], { stdio: 'inherit' });
		ingestion.on('error', reject);
		ingestion.on('exit', (code, signal) => {
			ingestion = undefined;
			if (code === 0 || stopping) resolve();
			else reject(new Error(`Scheduled ingestion failed: ${signal ?? code}`));
		});
	});
}

try {
	const port = process.env.PORT ?? '4321';
	let ready = false;
	for (let attempt = 0; attempt < 60 && !stopping; attempt++) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
			await response.arrayBuffer();
			if (response.ok) { ready = true; break; }
		} catch (error) {
			if (attempt === 59) throw error;
		}
		await new Promise(resolve => setTimeout(resolve, 1000));
	}
	if (!stopping) {
		if (!ready) throw new Error('Web server healthcheck failed within 60 seconds');
		if (enabled) {
			stopSchedule = startDailyIngestion(
				runIngestion,
				timestamp => log.info(`Next ingestion: ${new Date(timestamp).toISOString()}`),
				error => log.error(error instanceof Error ? error.message : String(error)),
			);
		}
		else log.info('Scheduled ingestion disabled (INGEST_ENABLED=false)');
	}
} catch (error) {
	log.error(error instanceof Error ? error.message : String(error));
	shutdown(1);
}
