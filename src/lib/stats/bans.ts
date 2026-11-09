import type Database from 'better-sqlite3';
import { championId } from '../lol';
import { getMatches } from './matches';
import { parseMatchInfo } from './shared';
import { cachedRead } from './cache';

export interface BanRecord {
	champion: string;
	bans: number;
	lastBannedAt: number;
}

export interface TeamBans {
	/** Parties à cinq dont la réponse Riot contient la phase de bans. */
	matches: number;
	records: BanRecord[];
	/** Bans dont l'identifiant numérique n'a jamais été vu dans nos parties stockées. */
	unresolved: number;
}

/**
 * Les bans de notre côté dans les parties Flex à cinq. Les identifiants numériques
 * sont résolus grâce aux participants des matchs déjà stockés, sans appel externe.
 */
export function getTeamBans(database: Database.Database): TeamBans {
	return cachedRead(database, 'bans', () => queryTeamBans(database));
}

function queryTeamBans(database: Database.Database): TeamBans {
	const keys = new Map(
		(database.prepare(`SELECT DISTINCT CAST(json_extract(participant.value, '$.championId') AS INTEGER) AS id,
			json_extract(participant.value, '$.championName') AS name
			FROM matches, json_each(matches.raw_json, '$.info.participants') AS participant
			WHERE matches.raw_json IS NOT NULL AND json_extract(participant.value, '$.championId') IS NOT NULL`)
			.all() as { id: number; name: string | null }[])
			.filter((row) => typeof row.name === 'string')
			.map((row) => [row.id, championId(row.name!)]),
	);
	const fullMatches = getMatches(database, 'full');
	const rawById = new Map(
		(database.prepare('SELECT match_id AS id, raw_json AS rawJson FROM matches WHERE queue_id = 440 AND raw_json IS NOT NULL')
			.all() as { id: string; rawJson: string }[]).map((row) => [row.id, row.rawJson]),
	);

	const records = new Map<string, BanRecord>();
	let matches = 0;
	let unresolved = 0;
	for (const match of fullMatches) {
		const rawJson = rawById.get(match.id);
		if (!rawJson) continue;
		const info = parseMatchInfo(rawJson);
		const ourTeamId = info.participants.find((participant) => participant.puuid === match.members[0]?.puuid)?.teamId;
		const bans = info.teams.find((team) => team.teamId === ourTeamId)?.bans;
		if (!Array.isArray(bans)) continue;
		matches += 1;
		for (const ban of bans) {
			if (!Number.isSafeInteger(ban?.championId) || ban.championId <= 0) continue;
			const champion = keys.get(ban.championId);
			if (!champion) {
				unresolved += 1;
				continue;
			}
			const record = records.get(champion) ?? { champion, bans: 0, lastBannedAt: match.startedAt };
			record.bans += 1;
			record.lastBannedAt = Math.max(record.lastBannedAt, match.startedAt);
			records.set(champion, record);
		}
	}

	return {
		matches,
		records: [...records.values()].sort((left, right) =>
			right.bans - left.bans || right.lastBannedAt - left.lastBannedAt || left.champion.localeCompare(right.champion)),
		unresolved,
	};
}
