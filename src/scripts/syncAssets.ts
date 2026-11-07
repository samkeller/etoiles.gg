/**
 * ═════════════════════════════════════════════════════════════════
 *  ÉTOILES DE L'ESPORT ★ etoiles.gg ★ Sync des assets graphiques
 * ──────────────────────────────────────────────────────────────
 *  Portraits champions (depuis participants) + icônes de profil
 *  (summoner-v4) → public/riot/. Idempotent, à lancer après ingest.
 * ═════════════════════════════════════════════════════════════════
 */
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { db } from '../lib/db/db';

const TOKEN = process.env.RIOT_API_KEY!;
const DD_BASE = 'https://ddragon.leagueoflegends.com';
const RIOT_ASSETS_DIR = 'public/riot';

const version = (await (await fetch(`${DD_BASE}/api/versions.json`)).json())[0];
console.log(`Data Dragon ${version}`);

// ── 1. Champions distincts joués par l'équipe ────────────────────
const champions = (db.prepare('SELECT DISTINCT champion FROM participants').all() as { champion: string }[])
    .map((r) => r.champion)
    .filter(Boolean);

await mkdir(`${RIOT_ASSETS_DIR}/champions`, { recursive: true });
for (const name of champions) {
    const url = `${DD_BASE}/cdn/${version}/img/champion/${name}.png`;
    const res = await fetch(url);
    if (!res.ok) { console.error(`  ✗ ${name} (${res.status})`); continue; }
    await writeFile(`${RIOT_ASSETS_DIR}/champions/${name}.png`, Buffer.from(await res.arrayBuffer()));
    console.log(`  ✓ ${name}`);
}

// ── 2. Icônes de profil des 5 joueurs ────────────────────────────
const players = db.prepare('SELECT puuid FROM players').all() as { puuid: string }[];
await mkdir(`${RIOT_ASSETS_DIR}/profiles`, { recursive: true });
for (const p of players) console.log(JSON.stringify(p.puuid)); //
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