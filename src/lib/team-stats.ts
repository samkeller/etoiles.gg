export interface TeamMatchResult {
	startedAt: number;
	won: boolean;
	lineupSize: number;
}

export interface TeamOverview {
	matchCount: number;
	winCount: number;
	winRate: number | null;
	firstMatchAt: number | null;
	lastMatchAt: number | null;
	currentStreak: {
		result: 'win' | 'loss' | null;
		count: number;
	};
}

export function getTeamOverview(matches: readonly TeamMatchResult[]): TeamOverview {
	const fullTeamMatches = matches
		.filter((match) => match.lineupSize === 5)
		.toSorted((left, right) => right.startedAt - left.startedAt);
	const winCount = fullTeamMatches.filter((match) => match.won).length;
	const latestResult = fullTeamMatches[0]?.won;
	let streakCount = 0;

	for (const match of fullTeamMatches) {
		if (match.won !== latestResult) break;
		streakCount += 1;
	}

	return {
		matchCount: fullTeamMatches.length,
		winCount,
		winRate: fullTeamMatches.length === 0 ? null : winCount / fullTeamMatches.length,
		firstMatchAt: fullTeamMatches.at(-1)?.startedAt ?? null,
		lastMatchAt: fullTeamMatches[0]?.startedAt ?? null,
		currentStreak: {
			result: latestResult === undefined ? null : latestResult ? 'win' : 'loss',
			count: streakCount,
		},
	};
}
