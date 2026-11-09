import type Database from 'better-sqlite3';
import type { ParticipantDto } from '../types';
import { cachedRead } from './cache';
import { getMatches, type MatchSummary } from './matches';
import { parsedMatch } from './shared';
import { getMatchTimeline, type TimelineState } from './timelines';

export interface TeamFact {
	match: MatchSummary;
	players: ParticipantDto[];
	firstDragon: 'ours' | 'theirs' | null;
	earlySurrender: boolean;
	timeline: TimelineState;
}

export function getTeamFacts(database: Database.Database): TeamFact[] {
	return cachedRead(database, 'team-facts', () => {
		const raw = database.prepare('SELECT raw_json AS json FROM matches WHERE match_id = ?');
		return getMatches(database).map((match) => {
			const row = raw.get(match.id) as { json: string };
			const { info } = parsedMatch(row.json);
			const ids = new Set(match.members.map((member) => member.puuid));
			const players = info.participants.filter((participant) => ids.has(participant.puuid));
			const ours = info.teams.find((team) => team.teamId === players[0].teamId)!;
			const theirs = info.teams.find((team) => team.teamId !== ours.teamId)!;
			return {
				match, players,
				firstDragon: ours.objectives.dragon.first && !theirs.objectives.dragon.first ? 'ours' :
					theirs.objectives.dragon.first && !ours.objectives.dragon.first ? 'theirs' : null,
				earlySurrender: info.participants.some((participant) => participant.gameEndedInEarlySurrender === true),
				timeline: getMatchTimeline(database, match.id),
			};
		});
	});
}
