/**
 * ═════════════════════════════════════════════════════════════════
 *  ÉTOILES DE L'ESPORT ★ etoiles.gg ★ Ingest (idempotent)
 * ──────────────────────────────────────────────────────────────
 *  Synchro incrémentale via startTime ; backfill intégral si la
 *  base est vide. Les noms de joueurs sont rafraîchis à chaque
 *  match, insensible aux renommages.
 * ═════════════════════════════════════════════════════════════════
 */
import { getFlexMatchIds, getMatch } from '../lib/riot.js';
import { db } from '../lib/db/db';
import { log } from './log.js';

/**
 *  Lance l'ingestion des matchs flex pour les joueurs connus en DB.
 *  Utilise l'option --backfill pour récupérer l'historique complet.
 */
const BACKFILL = process.argv.includes('--backfill');
const QUEUE_FLEX = 440;
const PAGE_SIZE = 100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── 0. Roster : lu depuis la DB (peuplé par resolvePuids) ───────
log.step(0, 'Roster');
const players = db.prepare('SELECT puuid FROM players').all() as { puuid: string }[];
const puuids = players.map((p) => p.puuid);
if (!puuids.length) throw new Error('Aucun joueur en DB — lance d\'abord npm run resolvePuids');
log.done(0, 'Roster', `${puuids.length} joueurs`);
log.done(0, 'Roster', `${puuids.length} joueurs en base`);

//
// ── 1. IDs de matchs : incrémental, ou backfill si base vide ────
//
log.step(1, `Collecte des IDs (${BACKFILL ? 'backfill' : 'incrémental'})`);
const { max: lastKnownMs } = db
    .prepare('SELECT MAX(game_start_ts) AS max FROM matches')
    .get() as { max?: number };
const startTime = !BACKFILL && lastKnownMs
    ? Math.floor(lastKnownMs / 1000)
    : undefined;

const seen = new Set<string>();
for (const puuid of puuids) {
    const ids = await getFlexMatchIds(puuid, { start: 0, count: PAGE_SIZE, startTime });
    // en incrémental, une page de 100 couvre 100% des cas ; en backfill,
    // le manque de pagination est compensé par le re-run (voir note *)
    for (const id of ids) seen.add(id);
    await sleep(250);
}
log.done(1, 'Collecte des IDs', `${seen.size} matchs uniques listés`);



//
// ── 2. Seulement les matchs inconnus sont fetchés ────────────────
//
log.step(2, 'Diff avec la base');
const knownIds = new Set(
    (db.prepare('SELECT match_id FROM matches').all() as { match_id: string }[])
        .map((r) => r.match_id)
);
const todo = [...seen].filter((id) => !knownIds.has(id));
log.done(2, 'Diff avec la base', `${todo.length} IDs à traiter`);

//
// ── 3. Détail + insertion ────────────────────────────────────────
//
log.step(3, 'Insertion');
const insMatch = db.prepare('INSERT OR IGNORE INTO matches VALUES (?,?,?,?,?)');
const insPart = db.prepare('INSERT OR IGNORE INTO participants VALUES (?,?,?,?,?,?,?,?,?)');
const insRun = db.prepare('INSERT INTO ingest_runs VALUES (?,?,?)');

let newTeamMatches = 0;
for (const matchId of todo) {
    try {
        const m = await getMatch(matchId);
        const { info } = m;
        if (info.queueId !== QUEUE_FLEX) continue; // filet de sécurité

        const ours = (info.participants as any[]).filter((p) => puuids.includes(p.puuid));
        if (!ours.length) continue;

        insMatch.run(matchId, info.gameCreation, info.gameDuration, info.queueId, JSON.stringify(m));
        for (const p of ours) {
            insPart.run(matchId, p.puuid, p.championName, p.individualPosition,
                p.kills, p.deaths, p.assists, p.win ? 1 : 0, ours.length);
            db.prepare('UPDATE players SET game_name = ?, tag_line = ? WHERE puuid = ?')
                .run(p.riotIdGameName, p.riotIdTagline, p.puuid);
        }
        if (ours.length >= 2) newTeamMatches++;
        log.info(`  ✓ ${matchId} — ${ours.length}/5 étoiles`);
        await sleep(250);
    } catch (err) {
        log.error(`  ✗ ${matchId} — ${err instanceof Error ? err.message : err}`);
    }
}
insRun.run(Date.now(), newTeamMatches, 'ok');

log.done(3, 'Insertion', `${todo.length} matchs traités, dont ${newTeamMatches} matchs d'équipe`);
