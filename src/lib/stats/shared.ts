import type { MatchDto, MatchInfoDto } from '../types';
import type Database from 'better-sqlite3';
import { validateMatch } from '../matchValidation';
import { championId } from '../lol';

export type MatchOutcome = 'win' | 'loss';

export const FULL_LINEUP_SIZE = 5;

/** Un match « partiel » réunit au moins deux Étoiles, sans être au complet. */
export const MIN_PARTIAL_LINEUP_SIZE = 2;

export function toOutcome(won: boolean | number): MatchOutcome {
	return won ? 'win' : 'loss';
}

export function parseMatchInfo(rawJson: string): MatchInfoDto {
	return parsedMatch(rawJson).info;
}

const parsed = new Map<string, MatchDto>();
const MAX_CACHED_CHARACTERS = 16 * 1024 * 1024;
const MAX_CACHED_MATCHES = 256;
let cachedCharacters = 0;

export function parsedMatch(rawJson: string): MatchDto {
	const cached = parsed.get(rawJson);
	if (cached) {
		parsed.delete(rawJson);
		parsed.set(rawJson, cached);
		return cached;
	}
	const match = validateMatch(JSON.parse(rawJson));
	if (rawJson.length <= MAX_CACHED_CHARACTERS) {
		while (parsed.size && (cachedCharacters + rawJson.length > MAX_CACHED_CHARACTERS || parsed.size >= MAX_CACHED_MATCHES)) {
			const oldest = parsed.keys().next().value!;
			cachedCharacters -= oldest.length;
			parsed.delete(oldest);
		}
		parsed.set(rawJson, match);
		cachedCharacters += rawJson.length;
	}
	return match;
}

export interface StoredMember {
	puuid: string;
	win: number;
	lineupSize: number;
	champion: string;
	role: string;
	kills: number;
	deaths: number;
	assists: number;
}

/** Validate persisted participants, not the current roster (which may have changed). */
export function validatedLineup(database: Database.Database, id: string, rawJson: string, startedAt: number, durationS: number,
	storedMembers?: readonly StoredMember[]) {
	const match = parsedMatch(rawJson);
	if (match.metadata.matchId !== id) throw new Error(`Malformed raw match data for ${id}.`);
	const members = storedMembers ?? database.prepare(`SELECT puuid, win, lineup_size AS lineupSize, champion, role, kills, deaths, assists
		FROM participants WHERE match_id = ?`).all(id) as StoredMember[];
	const first = match.info.participants.find((participant) => participant.puuid === members[0]?.puuid);
	const consistent = Number.isFinite(startedAt) && startedAt >= 0 && Number.isFinite(durationS) && durationS >= 0 &&
		match.info.gameCreation === startedAt && match.info.gameDuration === durationS &&
		members.length >= 1 && members.length <= FULL_LINEUP_SIZE && first !== undefined &&
		members.every((member) => {
			const participant = match.info.participants.find((candidate) => candidate.puuid === member.puuid);
			return member.lineupSize === members.length && (member.win === 0 || member.win === 1) &&
				participant !== undefined && participant.teamId === first.teamId && Number(participant.win) === member.win &&
				championId(participant.championName) === championId(member.champion) &&
				participant.individualPosition === member.role &&
				(['kills', 'deaths', 'assists'] as const).every((key) => participant[key] === member[key]);
		});
	if (!consistent) throw new Error(`Inconsistent data found in match ${id}.`);
	return { info: match.info, members, teamId: first!.teamId };
}

export function minutes(durationS: number): number {
	return durationS / 60;
}

export function ratio(numerator: number, denominator: number): number | null {
	return denominator === 0 ? null : numerator / denominator;
}

/** (K + A) / D, avec D ramené à 1 pour une partie sans mort. */
export function kdaRatio(kills: number, deaths: number, assists: number): number {
	return (kills + assists) / Math.max(deaths, 1);
}
