/**
 * ═════════════════════════════════════════════════════════════════
 *  ÉTOILES DE L'ESPORT ★ etoiles.gg ★ Resolver de PUUIDs
 * ──────────────────────────────────────────────────────────────
 *  Chaque étoile garde son identité ; ici, Riot IDs deviennent
 *  PUUIDs, gravés en base. Argument : "Pseudo#TAG" → players.
 * ═════════════════════════════════════════════════════════════════
 */
import { getPuuid, parseRiotId } from '../lib/riot.js';
import { db } from '../lib/db/db.js';
import { log } from './log';

try {
    const riotId = process.argv[2];
    if (!riotId) throw new Error('Usage : npm run resolvePuids -- "Pseudo#TAG"');
    const [name, tag] = parseRiotId(riotId);
    const puuid = await getPuuid(riotId);
    db.prepare(`
      INSERT INTO players (puuid, game_name, tag_line) VALUES (?, ?, ?)
      ON CONFLICT(puuid) DO UPDATE SET game_name = excluded.game_name,
                                      tag_line = excluded.tag_line
    `).run(puuid, name, tag);
    log.info(`★ ${name}#${tag} → enregistré`);
} catch (error) {
    log.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
} finally {
    db.close();
}