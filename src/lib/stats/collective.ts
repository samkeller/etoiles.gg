import type Database from 'better-sqlite3';
import { cachedRead } from './cache';
import { championId, compareRoles } from '../lol';
import { getMatches, type MatchMember, type MatchSummary } from './matches';
import type { Position } from '../types';

export const MIN_DRAFT_GAMES = 5;

export interface PendingDraftObservation {
	members: Pick<MatchMember, 'puuid' | 'name' | 'champion' | 'role'>[];
	games: number;
	latestMatchId: string;
}

export interface DraftObservation {
	members: MatchMember[];
	games: number;
	wins: number;
	winRate: number;
	latestMatchId: string;
}

export interface PatchObservation {
	patch: string;
	games: number;
	wins: number;
	winRate: number;
}

export interface TeamCollective {
	games: number;
	winRate: number | null;
	minimumGames: number;
	associations: DraftObservation[];
	compositions: DraftObservation[];
	pendingAssociations: PendingDraftObservation[];
	pendingCompositions: PendingDraftObservation[];
	patches: PatchObservation[];
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

function pendingObservations(groups: Map<string, DraftGroup>): PendingDraftObservation[] {
	return [...groups.entries()]
		.filter(([, group]) => group.matches.length === MIN_DRAFT_GAMES - 1)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([, group]) => ({
			members: [...group.members]
				.sort((left, right) => compareRoles(left.role, right.role) || left.puuid.localeCompare(right.puuid))
				.map(({ puuid, name, champion, role }) => ({ puuid, name, champion, role })),
			games: group.matches.length,
			latestMatchId: group.matches.at(-1)!.id,
		}));
}

function comparePatches(left: string, right: string): number {
	const leftParts = left.split('.').map(Number);
	const rightParts = right.split('.').map(Number);
	for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
		const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
		if (difference) return difference;
	}
	return left.localeCompare(right);
}

export function getCollective(database: Database.Database, associationRoles: readonly Position[] = []): TeamCollective {
	if (associationRoles.length === 0) {
		return cachedRead(database, 'collective', () => calculateCollective(getMatches(database)));
	}
	return calculateCollective(getMatches(database), associationRoles);
}

/** Consumes already validated full-team summaries, avoiding a second database read on the page. */
export function calculateCollective(fullMatches: readonly MatchSummary[], associationRoles: readonly Position[] = []): TeamCollective {
	if (fullMatches.some((match) => match.lineupSize !== 5)) throw new Error('Collective statistics require full-team matches.');
	const matches = [...fullMatches].sort((left, right) => left.startedAt - right.startedAt || left.id.localeCompare(right.id));
	const associations = new Map<string, DraftGroup>();
	const compositions = new Map<string, DraftGroup>();
	const patchGroups = new Map<string, { games: number; wins: number }>();
	let wins = 0;

	for (const match of matches) {
		if (match.outcome === 'win') wins += 1;
		const patch = patchGroups.get(match.patch) ?? { games: 0, wins: 0 };
		patch.games += 1;
		patch.wins += Number(match.outcome === 'win');
		patchGroups.set(match.patch, patch);

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
	return {
		games: matches.length,
		winRate: matches.length === 0 ? null : wins / matches.length,
		minimumGames: MIN_DRAFT_GAMES,
		associations: observations(associations),
		compositions: observations(compositions),
		pendingAssociations: pendingObservations(associations),
		pendingCompositions: pendingObservations(compositions),
		patches: [...patchGroups].map(([patch, result]) => ({
			patch,
			...result,
			winRate: result.wins / result.games,
		})).sort((left, right) => comparePatches(left.patch, right.patch)),
	};
}
