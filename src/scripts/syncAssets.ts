/**
 * ═════════════════════════════════════════════════════════════════
 *  ÉTOILES DE L'ESPORT ★ etoiles.gg ★ Sync des assets graphiques
 * ──────────────────────────────────────────────────────────────
 *  Portraits et noms FR des champions (depuis les matchs) + icônes
 *  de profil (summoner-v4) → public/riot/. Idempotent, après ingest.
 * ═════════════════════════════════════════════════════════════════
 */
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { db } from '../lib/db/db';
import { championId } from '../lib/lol';

const TOKEN = process.env.RIOT_API_KEY!;
const DD_BASE = 'https://ddragon.leagueoflegends.com';
const RIOT_ASSETS_DIR = 'public/riot';
const CHAMPION_NAMES_FILE = 'src/lib/lol/champion-names.json';

const version = (await (await fetch(`${DD_BASE}/api/versions.json`)).json())[0];
console.log(`Data Dragon ${version}`);

// ── 1. Champions présents dans les matchs (alliés et adversaires) ─
const champions = (db.prepare(`
    SELECT DISTINCT json_extract(participant.value, '$.championName') AS champion
    FROM matches, json_each(matches.raw_json, '$.info.participants') AS participant
    WHERE matches.raw_json IS NOT NULL
`).all() as { champion: string | null }[])
    .map((r) => r.champion)
    .filter((name): name is string => Boolean(name));

await mkdir(`${RIOT_ASSETS_DIR}/champions`, { recursive: true });
for (const name of new Set(champions.map(championId))) {
    const url = `${DD_BASE}/cdn/${version}/img/champion/${name}.png`;
    const res = await fetch(url);
    if (!res.ok) { console.error(`  ✗ ${name} (${res.status})`); continue; }
    await writeFile(`${RIOT_ASSETS_DIR}/champions/${name}.png`, Buffer.from(await res.arrayBuffer()));
    console.log(`  ✓ ${name}`);
}

// ── 1b. Noms français des champions (clé = championName Riot) ────
const championData = (await (await fetch(`${DD_BASE}/cdn/${version}/data/fr_FR/champion.json`)).json()) as {
    data: Record<string, { id: string; name: string }>;
};
const championNames = Object.fromEntries(
    Object.values(championData.data)
        .map(({ id, name }) => [id, name] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
);
await writeFile(CHAMPION_NAMES_FILE, `${JSON.stringify(championNames, null, '\t')}\n`);
console.log(`  ✓ ${Object.keys(championNames).length} noms de champions`);

// ── 2. Icônes de profil des 5 joueurs ────────────────────────────
const players = db.prepare('SELECT puuid FROM players').all() as { puuid: string }[];
await mkdir(`${RIOT_ASSETS_DIR}/profiles`, { recursive: true });
for (const { puuid } of players) {
    const sumRes = await (await fetch(
        `https://euw1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`,
        { headers: { 'X-Riot-Token': TOKEN } }
    )).json() as { profileIconId: number };

    if (!sumRes) {
        console.error(`  ✗ profil ${puuid.slice(0, 8)}… — summoner-v4 not found`);
        continue;
    }

    const imgRes  = await fetch(`${DD_BASE}/cdn/${version}/img/profileicon/${sumRes.profileIconId}.png`);
    if (!imgRes.ok) {
        console.error(`  ✗ profil ${puuid.slice(0, 8)}… — profile icon not found`);
        continue;
    }

    await writeFile(`${RIOT_ASSETS_DIR}/profiles/${puuid}.png`, Buffer.from(await imgRes.arrayBuffer()));
    console.log(`  ✓ profil ${puuid.slice(0, 8)}… (icône #${sumRes.profileIconId})`);
}

console.log('★ Assets synchronisés');