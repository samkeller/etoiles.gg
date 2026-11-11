import type Database from 'better-sqlite3';
import * as riot from '../lib/riot';
import { acquireIngestLock } from '../lib/ingest-lock';
import { log } from './log';
import { ingest } from './ingestBackend';
import {
	formatIngestSummary, formatSyncStatus, readSyncStatus, runHistory, setupPlayers,
	SYNC_HELP, type SyncCommand,
} from './syncBackend';

export async function withSyncDatabase(
	mutate: boolean,
	recordFailedRun: boolean,
	action: (database: Database.Database) => Promise<void> | void,
) {
	const { db } = await import('../lib/db/db');
	let lock: ReturnType<typeof acquireIngestLock> | undefined;
	let heartbeat: ReturnType<typeof setInterval> | undefined;
	const startedAt = Date.now();
	const recordFailure = () => {
		if (lock && recordFailedRun) db.prepare(`INSERT INTO ingest_runs (started_at, finished_at, new_matches, status)
			VALUES (?, ?, 0, 'failed')`).run(startedAt, Date.now());
	};
	const interrupted = () => {
		log.error('Synchronization interrupted by server shutdown');
		if (heartbeat) clearInterval(heartbeat);
		try { recordFailure(); }
		finally {
			try { lock?.release(); }
			finally { db.close(); process.exit(1); }
		}
	};
	if (mutate) {
		process.on('SIGTERM', interrupted);
		process.on('SIGINT', interrupted);
	}
	try {
		if (mutate) {
			lock = acquireIngestLock(db);
			const activeLock = lock;
			heartbeat = setInterval(() => {
				try { activeLock.renew(); }
				catch (error) {
					log.error(error instanceof Error ? error.message : String(error));
					// No further writes are safe after ownership is lost.
					process.exit(1);
				}
			}, 30_000);
		}
		await action(db);
	} catch (error) {
		recordFailure();
		throw error;
	} finally {
		if (heartbeat) clearInterval(heartbeat);
		process.off('SIGTERM', interrupted);
		process.off('SIGINT', interrupted);
		try { lock?.release(); }
		finally { db.close(); }
	}
}

export async function executeSyncCommand(command: SyncCommand) {
	if (command.command === 'help') {
		console.log(SYNC_HELP);
		return;
	}
	const startedAt = Date.now();
	let lastProgressAt = startedAt;
	let lastPrintedAt = -Infinity;
	let waitingReported = false;
	let currentActivity = 'Ouverture de la base SQLite';
	const progress = (message: string) => {
		currentActivity = message;
		lastProgressAt = Date.now();
		waitingReported = false;
		if (Date.now() - lastPrintedAt >= 5000) {
			log.info(message);
			lastPrintedAt = Date.now();
		}
	};
	const requestOptions: Pick<import('../lib/backendHttp').RequestOptions, 'onRetry'> = {
		onRetry: ({ reason, attempt, maxRetries, delayMs }) => {
			log.info(`Riot : ${reason} · reprise ${attempt}/${maxRetries} dans ${Math.ceil(delayMs / 1000)} s · ${currentActivity}`);
			waitingReported = true;
		},
	};
	const client = {
		getPuuid: (id: string) => riot.getPuuid(id, requestOptions),
		getFlexMatchIds: (id: string, options: riot.FlexMatchIdsOptions) => riot.getFlexMatchIds(id, options, requestOptions),
		getRankedMatchIds: (id: string, options: riot.FlexMatchIdsOptions) => riot.getRankedMatchIds(id, options, requestOptions),
		getMatch: (id: string) => riot.getMatch(id, requestOptions),
		getRankEntries: (id: string) => riot.getRankEntries(id, requestOptions),
		getTimeline: (id: string) => riot.getTimeline(id, requestOptions),
	};
	if (command.command !== 'status') log.step(1, `sync ${command.command}`);
	const activityTimer = command.command === 'status' ? undefined : setInterval(() => {
		const waitingSeconds = Math.floor((Date.now() - lastProgressAt) / 1000);
		if (waitingSeconds >= 15 && !waitingReported) {
			log.info(`Attente Riot · ${waitingSeconds} s sans nouvelle progression · ${currentActivity}`);
			waitingReported = true;
		}
	}, 15_000);
	try {
		await withSyncDatabase(command.command !== 'status', command.command === 'update' || command.command === 'history', async (database) => {
			if (command.command === 'status') {
				for (const line of formatSyncStatus(readSyncStatus(database))) console.log(line);
				return;
			}
			riot.riotHeaders();
			if (command.command === 'setup') {
				log.step(2, `Enregistrement de ${command.riotIds.length} joueurs`);
				const count = await setupPlayers(database, command.riotIds, client, progress);
				log.info(`Setup réussi : ${count} joueurs enregistrés (les autres joueurs existants sont conservés).`);
				log.info('Prochaine action : npm run sync -- history, puis npm run sync -- status.');
				return;
			}
			if (command.command === 'history') {
				log.info(`Budget : ${command.maxDurationSeconds === undefined ? 'un seul lot' : `${command.maxDurationSeconds} s (une requête en cours peut dépasser ce budget)`}`);
				if (command.since !== undefined) {
					log.info(`Rattrapage depuis le ${command.since} à 00:00 UTC, sans modifier les curseurs existants.`);
				}
				let batches = 0;
				const result = await runHistory(database, client, command.maxDurationSeconds, (batch) => {
					for (const failure of batch.failures) log.error(failure);
					log.info(`Lot ${++batches} · ${formatIngestSummary(batch, true)}`);
				}, progress, command.since);
				log.step(2, 'Bilan');
				log.info(`Historique : ${result.batches} lot(s), arrêt : ${result.stopReason}.`);
				for (const line of formatSyncStatus(result.status, command.since)) log.info(line);
				if (result.failures || result.stopReason === 'no-progress') {
					if (result.stopReason === 'no-progress') log.error('Historical ingestion made no progress; inspect status before retrying.');
					if (result.failures) log.error('Historique arrêté après échec : corriger l’erreur / respecter la pause Riot avant de relancer.');
					process.exitCode = 1;
				}
				return;
			}
			const result = await ingest(database, client, false, { onProgress: progress });
			log.step(2, 'Bilan');
			for (const failure of result.failures) log.error(failure);
			log.info(formatIngestSummary(result, false));
			for (const line of formatSyncStatus(readSyncStatus(database))) log.info(line);
			if (result.failures.length) {
				log.error('Lot arrêté après échec : corriger l’erreur / respecter la pause Riot avant de relancer npm run sync -- update.');
				process.exitCode = 1;
			}
		});
	} finally {
		if (activityTimer) clearInterval(activityTimer);
		if (command.command !== 'status') log.info(`Fin de sync ${command.command} · durée totale=${((Date.now() - startedAt) / 1000).toFixed(1)} s`);
	}
}
