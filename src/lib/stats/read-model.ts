import type Database from 'better-sqlite3';
import { cachedRead } from './cache';
import { getMatches } from './matches';
import { getPlayers } from './players';
import { getTeamSessions } from './sessions';
import { compositionsForSeats, toDraftMatches } from './draft';

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
