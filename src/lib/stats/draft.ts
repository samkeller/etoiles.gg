import { championId } from '../lol';
import type { MatchSummary } from './matches';
import type { ChampionRecord } from './players';
import type { MatchOutcome } from './shared';

/**
 * Observations de draft : fonctions pures, sans base de données, partagées
 * entre le rendu serveur et le script client de la page /draft.
 */

export interface DraftPick {
	puuid: string;
	champion: string;
}

export interface DraftMatch {
	id: string;
	startedAt: number;
	outcome: MatchOutcome;
	picks: DraftPick[];
}

export interface DraftRecord {
	games: number;
	wins: number;
	/** Du plus récent au plus ancien. */
	matches: DraftMatch[];
}

export interface DraftPair {
	picks: [DraftPick, DraftPick];
	record: DraftRecord;
}

export interface DraftComposition {
	/** Un champion par siège, dans l'ordre des sièges fournis. */
	champions: string[];
	games: number;
	wins: number;
	lastPlayedAt: number;
	matchIds: string[];
}

export function toDraftMatches(matches: readonly MatchSummary[]): DraftMatch[] {
	return matches
		.map((match) => ({
			id: match.id,
			startedAt: match.startedAt,
			outcome: match.outcome,
			picks: match.members.map(({ puuid, champion }) => ({ puuid, champion: championId(champion) })),
		}))
		.sort(newestFirst);
}

function newestFirst(left: DraftMatch, right: DraftMatch): number {
	return right.startedAt - left.startedAt || left.id.localeCompare(right.id);
}

function includesPick(match: DraftMatch, pick: DraftPick): boolean {
	return match.picks.some((candidate) => candidate.puuid === pick.puuid && candidate.champion === pick.champion);
}

function toRecord(matches: DraftMatch[]): DraftRecord {
	const sorted = [...matches].sort(newestFirst);
	return { games: sorted.length, wins: sorted.filter((match) => match.outcome === 'win').length, matches: sorted };
}

/** Parties où chacun des picks (joueur + champion) était présent. */
export function matchesWithPicks(matches: readonly DraftMatch[], picks: readonly DraftPick[]): DraftRecord {
	if (picks.length === 0) return { games: 0, wins: 0, matches: [] };
	return toRecord(matches.filter((match) => picks.every((pick) => includesPick(match, pick))));
}

/** Chaque paire de picks sélectionnés, avec les parties où elle a été jouée ensemble. */
export function pairRecords(matches: readonly DraftMatch[], picks: readonly DraftPick[]): DraftPair[] {
	const pairs: DraftPair[] = [];
	for (let left = 0; left < picks.length; left += 1) {
		for (let right = left + 1; right < picks.length; right += 1) {
			const pair: [DraftPick, DraftPick] = [picks[left], picks[right]];
			pairs.push({ picks: pair, record: matchesWithPicks(matches, pair) });
		}
	}
	return pairs.sort((left, right) => right.record.games - left.record.games);
}

/**
 * Champions joués en Solo/Duo ou en Flex individuel mais jamais à cinq :
 * des pistes exploratoires, pas des recommandations.
 */
export function explorationPicks(
	teamPool: readonly Pick<ChampionRecord, 'champion'>[],
	personalPools: readonly (readonly ChampionRecord[])[],
	limit: number,
): ChampionRecord[] {
	const known = new Set(teamPool.map((record) => championId(record.champion)));
	const merged = new Map<string, ChampionRecord>();
	for (const pool of personalPools) {
		for (const record of pool) {
			const champion = championId(record.champion);
			if (known.has(champion)) continue;
			const current = merged.get(champion) ?? { champion, games: 0, wins: 0, lastPlayedAt: record.lastPlayedAt };
			current.games += record.games;
			current.wins += record.wins;
			current.lastPlayedAt = Math.max(current.lastPlayedAt, record.lastPlayedAt);
			merged.set(champion, current);
		}
	}
	return [...merged.values()]
		.sort((left, right) => right.games - left.games || right.lastPlayedAt - left.lastPlayedAt || left.champion.localeCompare(right.champion))
		.slice(0, Math.max(0, limit));
}

/** Compositions complètes déjà jouées par ces sièges, de la plus récente à la plus ancienne. */
export function compositionsForSeats(matches: readonly DraftMatch[], seats: readonly string[]): DraftComposition[] {
	const compositions = new Map<string, DraftComposition>();
	for (const match of [...matches].sort(newestFirst)) {
		const champions = seats.map((puuid) => match.picks.find((pick) => pick.puuid === puuid)?.champion);
		if (champions.some((champion) => champion === undefined)) continue;
		const key = champions.join('|');
		const composition = compositions.get(key) ??
			{ champions: champions as string[], games: 0, wins: 0, lastPlayedAt: match.startedAt, matchIds: [] };
		composition.games += 1;
		composition.wins += Number(match.outcome === 'win');
		composition.matchIds.push(match.id);
		compositions.set(key, composition);
	}
	return [...compositions.values()];
}
