/**
 * ═════════════════════════════════════════════════════════════════
 *  ÉTOILES DE L'ESPORT ★ etoiles.gg ★ Resolver de PUUIDs
 * ──────────────────────────────────────────────────────────────
 *  Chaque étoile garde son identité ; ici, Riot IDs deviennent
 *  PUUIDs, gravés en base. Argument : "Pseudo#TAG" → players.
 * ═════════════════════════════════════════════════════════════════
 */
import { getPuuid } from '../lib/riot.js';
import { db } from '../lib/db/db.js';

if (!process.env.RIOT_API_KEY) {
    throw new Error("La variable d'environnement RIOT_API_KEY est requise");
}

const riotId = process.argv[2];
if (!riotId) {
    console.error('Usage : npm run resolvePuids -- "Pseudo#TAG"');
    process.exit(1);
}

const puuid = await getPuuid(riotId);
const [name, tag] = riotId.split('#');

db.prepare(`
  INSERT INTO players (puuid, game_name, tag_line) VALUES (?, ?, ?)
  ON CONFLICT(puuid) DO UPDATE SET game_name = excluded.game_name,
                                  tag_line = excluded.tag_line
`).run(puuid, name, tag);

console.log(`★ ${name}#${tag} → enregistré [${puuid}]`);