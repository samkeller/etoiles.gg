/**
 * ═════════════════════════════════════════════════════════════════
 *  ÉTOILES DE L'ESPORT ★ etoiles.win ★ Resolver de PUUIDs
 * ──────────────────────────────────────────────────────────────
 *  Chaque étoile garde son identité ; ici, Riot IDs deviennent
 *  PUUIDs, gravés en base. Argument : "Pseudo#TAG" → players.
 * ═════════════════════════════════════════════════════════════════
 */
import 'dotenv/config';
import { getPuuid, parseRiotId } from '../lib/riot.js';
import { db } from '../lib/db/db.js';
import { log } from './log';

try {
    const players = process.env.PLAYERS?.split(',') ?? [];
    if (players.length === 0) throw new Error('No players specified in the PLAYERS environment variable.');
    
    log.info(`★ Found ${players.length} étoiles`);

    for (const riotId of players) {
        console.log(`Resolving PUUID for ${riotId}`);
        const [name, tag] = parseRiotId(riotId);
        const puuid = await getPuuid(riotId);
        db.prepare(`
          INSERT INTO players (puuid, game_name, tag_line) VALUES (?, ?, ?)
          ON CONFLICT(puuid) DO UPDATE SET game_name = excluded.game_name,
                                          tag_line = excluded.tag_line
        `).run(puuid, name, tag);
        log.info(`★ ${name}#${tag} → enregistré`);
    }

} catch (error) {
    log.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
} finally {
    db.close();
}