import type Database from 'better-sqlite3';
import { championId, compareRoles } from '../lol';
import { getMatches, type MatchMember, type MatchSummary } from './matches';
import type { Position } from '../types';

export const MIN_DRAFT_GAMES = 5;

export interface WinStreak {
	matches: MatchSummary[];
}

export interface DraftObservation {
	members: MatchMember[];
	games: number;
	wins: number;
	winRate: number;
	latestMatchId: string;
}

export interface TeamCollective {
	games: number;
	winRate: number | null;
	minimumGames: number;
	/** Séries d'au moins deux victoires, par longueur puis récence. */
	streaks: WinStreak[];
	associations: DraftObservation[];
	compositions: DraftObservation[];
}

interface DraftGroup {
	members: MatchMember[];
	matches: MatchSummary[];
}

function draftKey(members: readonly MatchMember[], includeRoles: boolean): string {
	return JSON.stringify(
		[...members]
			.sort((left, right) => left.puuid.localeCompare(right.puuid))
			.map((member) => [member.puuid, championId(member.champion), ...(includeRoles ? [member.role] : [])]),
	);
}

function addGroup(groups: Map<string, DraftGroup>, members: MatchMember[], match: MatchSummary, includeRoles: boolean) {
	const key = draftKey(members, includeRoles);
	const group = groups.get(key);
	if (group) {
		group.matches.push(match);
		group.members = members;
	} else {
		groups.set(key, { members, matches: [match] });
	}
}

function observations(groups: Map<string, DraftGroup>): DraftObservation[] {
	return [...groups.entries()]
		.filter(([, group]) => group.matches.length >= MIN_DRAFT_GAMES)
		.map(([key, group]) => {
			const wins = group.matches.filter((match) => match.outcome === 'win').length;
			return {
				key,
				members: [...group.members].sort((left, right) =>
					compareRoles(left.role, right.role) || left.puuid.localeCompare(right.puuid),
				),
				games: group.matches.length,
				wins,
				winRate: wins / group.matches.length,
				latestMatchId: group.matches.at(-1)!.id,
			};
		})
		.sort((left, right) =>
			right.winRate - left.winRate || right.games - left.games || left.key.localeCompare(right.key),
		)
		.map(({ key, ...observation }) => observation);
}

export function getCollective(database: Database.Database, associationRoles: readonly Position[] = []): TeamCollective {
	// Reuse the full-lineup validation and filtering from the match history.
	const matches = getMatches(database).reverse();
	const associations = new Map<string, DraftGroup>();
	const compositions = new Map<string, DraftGroup>();
	const streaks: WinStreak[] = [];
	let runningWins: MatchSummary[] = [];
	let wins = 0;

	const finishStreak = () => {
		if (runningWins.length >= 2) streaks.push({ matches: runningWins });
		runningWins = [];
	};

	for (const match of matches) {
		if (match.outcome === 'win') {
			wins += 1;
			runningWins.push(match);
		} else {
			finishStreak();
		}

		for (let left = 0; left < match.members.length; left += 1) {
			for (let right = left + 1; right < match.members.length; right += 1) {
				const pair = [match.members[left], match.members[right]];
				if (associationRoles.every((role) => pair.some((member) => member.role === role))) {
					addGroup(associations, pair, match, false);
				}
			}
		}
		addGroup(compositions, match.members, match, true);
	}
	finishStreak();
	streaks.sort((left, right) =>
		right.matches.length - left.matches.length ||
		right.matches.at(-1)!.startedAt - left.matches.at(-1)!.startedAt,
	);

	return {
		games: matches.length,
		winRate: matches.length === 0 ? null : wins / matches.length,
		minimumGames: MIN_DRAFT_GAMES,
		streaks,
		associations: observations(associations),
		compositions: observations(compositions),
	};
}
