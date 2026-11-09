import type { RankSnapshot } from './individual';

const TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND'];
const DIVISIONS = ['IV', 'III', 'II', 'I'];
const DAY = 86_400_000;

export interface RankPoint {
	at: number;
	value: number | null;
	snapshot: RankSnapshot;
	breakBefore: boolean;
}

/** Vertical coordinate only, not a rating: apex tiers all share the Master LP baseline. */
export function rankCoordinate(snapshot: RankSnapshot): number | null {
	if (snapshot.tier === null) return null;
	if (snapshot.leaguePoints === null || !Number.isSafeInteger(snapshot.leaguePoints) || snapshot.leaguePoints < 0) {
		throw new Error('Invalid rank snapshot LP.');
	}
	if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(snapshot.tier)) return 2800 + snapshot.leaguePoints;
	const tier = TIERS.indexOf(snapshot.tier);
	const division = DIVISIONS.indexOf(snapshot.division ?? '');
	if (tier < 0 || division < 0) throw new Error(`Unsupported rank snapshot: ${snapshot.tier} ${snapshot.division}.`);
	return tier * 400 + division * 100 + snapshot.leaguePoints;
}

export function rankPoints(history: readonly RankSnapshot[]): RankPoint[] {
	const points: RankPoint[] = [];
	for (const snapshot of [...history].sort((a, b) => a.capturedOn.localeCompare(b.capturedOn))) {
		const at = Date.parse(`${snapshot.capturedOn}T00:00:00Z`);
		if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.capturedOn) || !Number.isFinite(at) ||
			new Date(at).toISOString().slice(0, 10) !== snapshot.capturedOn || points.at(-1)?.at === at) {
			throw new Error('Invalid rank snapshot date.');
		}
		const previous = points.at(-1);
		const reset = previous?.snapshot.wins !== null && previous?.snapshot.wins !== undefined &&
			previous.snapshot.losses !== null && snapshot.wins !== null && snapshot.losses !== null &&
			snapshot.wins + snapshot.losses < previous.snapshot.wins + previous.snapshot.losses;
		points.push({
			at, value: rankCoordinate(snapshot), snapshot,
			breakBefore: !previous || at - previous.at > DAY || previous.value === null || reset,
		});
	}
	return points;
}
