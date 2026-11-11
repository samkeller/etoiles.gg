import type Database from 'better-sqlite3';
import { parseRiotId } from '../lib/riot';
import { ingest } from './ingestBackend';
import { TIMELINE_VERSION } from '../lib/timeline';

export const SYNC_HELP = `Usage:
  npm run sync -- setup ["Name#TAG" ...]
  npm run sync -- update
  npm run sync -- history [--since YYYY-MM-DD] [--max-duration SECONDS]
  npm run sync -- status
  npm run sync -- help

setup: explicit Riot IDs override comma-separated PLAYERS; all IDs are validated first.
history: one resumable batch by default; --max-duration repeats batches within a
positive scheduling budget in seconds (maximum 86400). An in-flight Riot request
can finish after the budget; existing HTTP timeouts/retries remain unchanged.
No waiting between batches: failures or deferred-only work stop the command.
--since rescans both ranked queues from midnight UTC on that date, independently
of existing cursors. Relaunching rescans the window; collected IDs remain persisted.
Each batch also collects up to 10 compact timelines for five-player Flex matches.
status/help do not require a Riot API key.`;

export type SyncCommand =
	| { command: 'help' | 'update' | 'status' }
	| { command: 'setup'; riotIds: string[] }
	| { command: 'history'; maxDurationSeconds?: number; since?: string };

export function historyStartTime(since: string): number {
	const milliseconds = Date.parse(`${since}T00:00:00.000Z`);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !Number.isFinite(milliseconds) ||
		milliseconds < 0 || milliseconds > Date.now() || new Date(milliseconds).toISOString().slice(0, 10) !== since) {
		throw new Error('history --since expects a valid YYYY-MM-DD date, from 1970 through today (UTC).');
	}
	return milliseconds / 1000;
}

export function resolveRiotIds(args: string[], playersEnv?: string): string[] {
	const values = args.length ? args : playersEnv?.split(',') ?? [];
	if (!values.length) throw new Error('No players specified; pass Riot IDs ("Name#TAG") or set PLAYERS.');
	return values.map((value) => {
		if (value.trim().startsWith('-')) throw new Error(`Unknown option: ${value}`);
		const [name, tag] = parseRiotId(value);
		return `${name}#${tag}`;
	});
}

export function parseSyncArgs(args: string[], playersEnv?: string): SyncCommand {
	const [command, ...rest] = args;
	if (!command || command === 'help' || command === '--help' || command === '-h') {
		if (rest.length) throw new Error('Help does not accept arguments.');
		return { command: 'help' };
	}
	if (['setup', 'update', 'history', 'status'].includes(command) &&
		rest.length === 1 && (rest[0] === '--help' || rest[0] === '-h')) return { command: 'help' };
	if (command === 'setup') return { command, riotIds: resolveRiotIds(rest, playersEnv) };
	if (command === 'update' || command === 'status') {
		if (rest.length) throw new Error(`${command} does not accept arguments.`);
		return { command };
	}
	if (command === 'history') {
		const result: Extract<SyncCommand, { command: 'history' }> = { command };
		for (let index = 0; index < rest.length; index += 2) {
			const option = rest[index];
			const value = rest[index + 1];
			if (option === '--since' && result.since === undefined && value !== undefined) {
				historyStartTime(value);
				result.since = value;
			} else if (option === '--max-duration' && result.maxDurationSeconds === undefined && value !== undefined) {
				const seconds = Number(value);
				if (!/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(seconds) || seconds <= 0 || seconds > 86400) {
					throw new Error('history expects --max-duration SECONDS (positive number, maximum 86400).');
				}
				result.maxDurationSeconds = seconds;
			} else {
				throw new Error('history expects [--since YYYY-MM-DD] [--max-duration SECONDS], without duplicate options.');
			}
		}
		return result;
	}
	throw new Error(`Unknown sync command: ${command}. Use npm run sync -- help.`);
}

export async function setupPlayers(
	database: Database.Database,
	riotIds: string[],
	client: { getPuuid(id: string): Promise<string> },
	onProgress: (message: string) => void = () => {},
): Promise<number> {
	const ids = resolveRiotIds(riotIds);
	const insert = database.prepare(`INSERT INTO players (puuid, game_name, tag_line) VALUES (?, ?, ?)
		ON CONFLICT(puuid) DO UPDATE SET game_name = excluded.game_name, tag_line = excluded.tag_line`);
	let resolved = 0;
	for (const id of ids) {
		try {
			onProgress(`Joueur ${resolved + 1}/${ids.length} : résolution de ${id}`);
			const puuid = await client.getPuuid(id);
			if (typeof puuid !== 'string' || !puuid.trim() || /[\u0000-\u001f/\\]/.test(puuid)) {
				throw new Error('Invalid Riot account PUUID');
			}
			const [name, tag] = parseRiotId(id);
			insert.run(puuid, name, tag);
			resolved += 1;
			onProgress(`Joueur ${resolved}/${ids.length} : ${id} enregistré`);
		} catch (error) {
			throw new Error(`Setup ${id} (${resolved}/${ids.length} enregistrés): ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	return resolved;
}

export function readSyncStatus(database: Database.Database, queues: readonly number[] = [420, 440]) {
	const now = Date.now();
	const pending = database.prepare(`SELECT COUNT(*) AS count,
		COALESCE(SUM(CASE WHEN next_attempt_at <= ? THEN 1 ELSE 0 END), 0) AS ready,
		MIN(CASE WHEN next_attempt_at > ? THEN next_attempt_at END) AS nextRetry
		FROM ingest_pending`).get(now, now) as { count: number; ready: number; nextRetry: number | null };
	const rows = database.prepare(`SELECT pl.puuid, pl.game_name AS name, q.queue_id AS queueId,
		cursor.next_start AS nextStart, cursor.is_complete AS isComplete
		FROM players AS pl
		CROSS JOIN (SELECT 420 AS queue_id UNION ALL SELECT 440) AS q
		LEFT JOIN ingest_backfill_cursors AS cursor
			ON cursor.puuid = pl.puuid AND cursor.queue_id = q.queue_id
		ORDER BY pl.game_name, pl.puuid, q.queue_id`).all() as {
			puuid: string; name: string | null; queueId: 420 | 440;
			nextStart: number | null; isComplete: number | null;
		}[];
	const cursors = rows.filter((row) => queues.includes(row.queueId));
	const timelines = database.prepare(`SELECT
		COUNT(CASE WHEN needs_refresh THEN 1 END) AS pending,
		COUNT(CASE WHEN needs_refresh AND next_attempt_at <= ? THEN 1 END) AS ready,
		COUNT(CASE WHEN status = 'ready' THEN 1 END) AS collected,
		COUNT(CASE WHEN status = 'unavailable' THEN 1 END) AS unavailable,
		MIN(CASE WHEN needs_refresh AND next_attempt_at > ? THEN next_attempt_at END) AS nextRetryAt
		FROM (SELECT *, (status = 'pending' OR
			(status = 'ready' AND json_extract(summary_json, '$.version') < ${TIMELINE_VERSION})) AS needs_refresh
			FROM match_timelines)`).get(now, now) as {
			pending: number; ready: number; collected: number; unavailable: number; nextRetryAt: number | null;
		};
	const collectionComplete = cursors.length > 0 && cursors.every((row) => row.isComplete === 1);
	return {
		pendingRemaining: pending.count, pendingReady: pending.ready,
		pendingDeferred: pending.count - pending.ready, nextRetryAt: pending.nextRetry,
		cursors, timelines, collectionComplete, historyComplete: collectionComplete && pending.count === 0 && timelines.pending === 0,
	};
}

export function formatSyncStatus(status: ReturnType<typeof readSyncStatus>, since?: string): string[] {
	const lines = [`File d’attente : ${status.pendingRemaining} matchs · ${status.pendingReady} prêts · ${status.pendingDeferred} différés.`];
	if (status.nextRetryAt !== null) lines.push(`Prochaine reprise différée : ${new Date(status.nextRetryAt).toISOString()}`);
	lines.push(`Timelines à cinq : ${status.timelines.collected} disponibles · ${status.timelines.unavailable} absentes chez Riot · ${status.timelines.pending} en attente (${status.timelines.ready} prêtes).`);
	if (status.timelines.nextRetryAt !== null) lines.push(`Reprise timelines : ${new Date(status.timelines.nextRetryAt).toISOString()}`);
	for (const row of status.cursors) {
		const state = row.isComplete === 1 ? 'collecte terminée' :
			row.nextStart === null ? 'à démarrer' : `reprendra à l’offset ${row.nextStart}`;
		lines.push(`${row.name ?? row.puuid} · ${row.queueId === 420 ? 'Solo/Duo' : 'Flex'} : ${state}.`);
	}
	if (since !== undefined) {
		lines.push(`Rattrapage depuis le ${since} à 00:00 UTC : collecte ${status.collectionComplete ? 'terminée' : 'incomplète'}.`);
		if (status.historyComplete) lines.push('Rattrapage terminé. Les curseurs existants sont inchangés.');
		else lines.push(`Rattrapage incomplet. ${status.pendingDeferred && !status.pendingReady ? 'Respecter la reprise différée, puis ' : ''}relancer npm run sync -- history --since ${since} --max-duration 120.`);
	} else if (!status.cursors.length) lines.push('Aucun joueur enregistré. Prochaine action : npm run sync -- setup "Name#TAG".');
	else if (status.historyComplete) lines.push('Historique terminé. Prochaine action : npm run sync -- update.');
	else if (status.collectionComplete && !status.pendingReady && !status.timelines.ready) {
		lines.push('Historique incomplet : détails ou timelines différés. Attendre la reprise indiquée, puis npm run sync -- history.');
	} else lines.push('Historique incomplet. Prochaine action : npm run sync -- history.');
	return lines;
}

export type IngestResult = Awaited<ReturnType<typeof ingest>>;

export function formatIngestSummary(result: IngestResult, backfill: boolean): string {
	return `${backfill ? 'Lot historique' : 'Lot incrémental'} ${result.failures.length ? 'en échec' : result.budgetExhausted ? 'interrompu par le budget' : 'réussi'} : ` +
		`${result.importedByQueue[440]} imports Flex, ${result.importedByQueue[420]} imports Solo/Duo, ` +
		`${result.newMatches} nouveaux matchs Flex à cinq, ${result.existingMatches} déjà présents, ` +
		`${result.repairedMatches} réparés, ${result.timelinesCollected} timelines, ` +
		`${result.timelinesUnavailable} timelines absentes chez Riot, ${result.failures.length} échecs.`;
}

export async function runHistory(
	database: Database.Database,
	client: Parameters<typeof ingest>[1],
	maxDurationSeconds?: number,
	onBatch: (result: IngestResult) => void = () => {},
	onProgress: (message: string) => void = () => {},
	since?: string,
) {
	if (maxDurationSeconds !== undefined && (!Number.isFinite(maxDurationSeconds) || maxDurationSeconds <= 0 || maxDurationSeconds > 86400)) {
		throw new Error('Invalid history duration (seconds, maximum 86400).');
	}
	const deadlineAt = maxDurationSeconds === undefined ? undefined : Date.now() + maxDurationSeconds * 1000;
	const sinceStartTime = since === undefined ? undefined : historyStartTime(since);
	const queues = client.getRankedMatchIds ? [420, 440] : [440];
	let windowCollected = false;
	const status = () => {
		const current = readSyncStatus(database, queues);
		if (sinceStartTime === undefined) return current;
		return {
			...current,
			cursors: [],
			collectionComplete: windowCollected,
			historyComplete: windowCollected && current.pendingRemaining === 0 && current.timelines.pending === 0,
		};
	};
	let batches = 0;
	let failures = 0;
	let stopReason: 'single-batch' | 'complete' | 'budget' | 'failed' | 'deferred' | 'no-progress' = 'single-batch';
	for (;;) {
		const before = status();
		onProgress(`Lot historique ${batches + 1} : début${deadlineAt === undefined ? '' : ` · budget restant ${Math.max(0, (deadlineAt - Date.now()) / 1000).toFixed(1)} s`}`);
		const result = await ingest(database, client, true, {
			deadlineAt, onProgress, sinceStartTime,
			skipCollection: sinceStartTime !== undefined && windowCollected,
		});
		if (sinceStartTime !== undefined) windowCollected = result.collectionComplete;
		batches += 1;
		failures += result.failures.length;
		onBatch(result);
		const after = status();
		if (result.failures.length) { stopReason = 'failed'; break; }
		if (after.historyComplete) { stopReason = 'complete'; break; }
		if (result.budgetExhausted || (deadlineAt !== undefined && Date.now() >= deadlineAt)) { stopReason = 'budget'; break; }
		if (deadlineAt === undefined) break;
		if (after.collectionComplete && !after.pendingReady && !after.timelines.ready) { stopReason = 'deferred'; break; }
		if (JSON.stringify(before) === JSON.stringify(after)) { stopReason = 'no-progress'; break; }
	}
	return { batches, failures, stopReason, status: status() };
}
