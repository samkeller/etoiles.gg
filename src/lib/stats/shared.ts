import type { MatchDto, MatchInfoDto } from '../types';

export type MatchOutcome = 'win' | 'loss';

export const FULL_LINEUP_SIZE = 5;

/** Un match « partiel » réunit au moins deux Étoiles, sans être au complet. */
export const MIN_PARTIAL_LINEUP_SIZE = 2;

export function toOutcome(won: boolean | number): MatchOutcome {
	return won ? 'win' : 'loss';
}

export function parseMatchInfo(rawJson: string): MatchInfoDto {
	return (JSON.parse(rawJson) as MatchDto).info;
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
