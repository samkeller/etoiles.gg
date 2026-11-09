import { db } from '../lib/db/db';

try {
	const now = Date.now();
	const pending = db.prepare(`SELECT COUNT(*) AS count,
		SUM(CASE WHEN next_attempt_at <= ? THEN 1 ELSE 0 END) AS ready,
		MIN(CASE WHEN next_attempt_at > ? THEN next_attempt_at END) AS nextRetry
		FROM ingest_pending`).get(now, now) as { count: number; ready: number | null; nextRetry: number | null };
	const rows = db.prepare(`SELECT pl.game_name AS name, q.queue_id AS queueId,
		cursor.next_start AS nextStart, cursor.is_complete AS isComplete
		FROM players AS pl
		CROSS JOIN (SELECT 420 AS queue_id UNION ALL SELECT 440) AS q
		LEFT JOIN ingest_backfill_cursors AS cursor
			ON cursor.puuid = pl.puuid AND cursor.queue_id = q.queue_id
		ORDER BY pl.game_name, q.queue_id`).all() as {
			name: string | null;
			queueId: 420 | 440;
			nextStart: number | null;
			isComplete: number | null;
		}[];

	console.log(`Matchs en attente : ${pending.count} · ${pending.ready ?? 0} à traiter`);
	if (pending.nextRetry !== null) {
		console.log(`Prochaine reprise différée : ${new Date(pending.nextRetry).toLocaleString('fr-FR')}`);
	}
	if (rows.length === 0) {
		console.log('Aucun joueur enregistré.');
	} else if (rows.every((row) => row.nextStart === null)) {
		console.log('Backfill historique non démarré. Lancez npm run ingest:backfill pour le commencer.');
	} else {
		for (const row of rows) {
			const queue = row.queueId === 420 ? 'Solo/Duo' : 'Flex';
			const status = row.nextStart === null
				? 'à démarrer'
				: row.isComplete
					? 'terminé'
					: `reprendra à la page ${Math.floor(row.nextStart / 100) + 1}`;
			console.log(`${row.name ?? 'Étoile'} · ${queue} : ${status}${row.nextStart ? ` (${row.nextStart} IDs listés)` : ''}`);
		}
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
} finally {
	db.close();
}
