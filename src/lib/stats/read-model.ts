import type Database from 'better-sqlite3';
import { cachedRead } from './cache';
import { getMatches } from './matches';
import { getPlayers, type ChampionRecord } from './players';
import { getTeamSessions } from './sessions';
import { compositionsForSeats, toDraftMatches } from './draft';
import { championId } from '../lol';
import { parseMatchInfo } from './shared';

export function getSessionHistory(database: Database.Database) {
	return cachedRead(database, 'sessions', () => getTeamSessions(getMatches(database)));
}

export function getDraftHistory(database: Database.Database) {
	return cachedRead(database, 'draft-history', () => {
		const matches = toDraftMatches(getMatches(database));
		const seats = getPlayers(database).map((player) => player.puuid);
		const compositions = compositionsForSeats(matches, seats)
			.sort((left, right) => right.games - left.games || right.lastPlayedAt - left.lastPlayedAt);
		return { matches, compositions };
	});
}

/** Bilans de notre équipe à cinq contre chaque champion adverse, victoires incluses. */
export function getDraftOpponents(database: Database.Database): ChampionRecord[] {
	return cachedRead(database, 'draft-opponents', () => {
		const matches = getMatches(database, 'full');
		const rawById = new Map(
			(database.prepare('SELECT match_id AS id, raw_json AS rawJson FROM matches WHERE queue_id = 440 AND raw_json IS NOT NULL')
				.all() as { id: string; rawJson: string }[]).map((row) => [row.id, row.rawJson]),
		);
		const records = new Map<string, ChampionRecord>();
		for (const match of matches) {
			const rawJson = rawById.get(match.id);
			if (!rawJson) throw new Error(`Missing raw data for match ${match.id}.`);
			const info = parseMatchInfo(rawJson);
			const ourTeam = info.participants.find((participant) => participant.puuid === match.members[0]?.puuid)?.teamId;
			if (ourTeam === undefined) throw new Error(`Missing team for match ${match.id}.`);
			const opponents = new Set(info.participants.filter((participant) => participant.teamId !== ourTeam)
				.map((participant) => championId(participant.championName)));
			for (const champion of opponents) {
				const record = records.get(champion) ?? { champion, games: 0, wins: 0, lastPlayedAt: match.startedAt };
				record.games += 1;
				record.wins += Number(match.outcome === 'win');
				record.lastPlayedAt = Math.max(record.lastPlayedAt, match.startedAt);
				records.set(champion, record);
			}
		}
		return [...records.values()]
			.sort((left, right) => right.games - left.games
				|| left.champion.localeCompare(right.champion));
	});
}
