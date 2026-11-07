import type Database from 'better-sqlite3';

export type MatchOutcome = 'win' | 'loss';

export const RECENT_FORM_SIZE = 20;

export interface TeamOverview {
	matchCount: number;
	winCount: number;
	lossCount: number;
	winRate: number | null;
	firstMatchAt: number | null;
	lastMatchAt: number | null;
	currentStreak: {
		result: MatchOutcome | null;
		count: number;
	};
	bestWinStreak: number;
	/** Derniers résultats, du plus ancien au plus récent. */
	recentForm: MatchOutcome[];
}

interface FullTeamMatchRow {
	startedAt: number | null;
	participantCount: number;
	minLineupSize: number | null;
	maxLineupSize: number | null;
	minWin: number | null;
	maxWin: number | null;
}

interface TeamMatchResult {
	startedAt: number;
	won: boolean;
}

export function getOverview(database: Database.Database): TeamOverview {
	const matches = database
		.prepare(`
			SELECT
				m.game_start_ts AS startedAt,
				COUNT(*) AS participantCount,
				MIN(p.lineup_size) AS minLineupSize,
				MAX(p.lineup_size) AS maxLineupSize,
				MIN(p.win) AS minWin,
				MAX(p.win) AS maxWin
			FROM matches AS m
			INNER JOIN participants AS p ON p.match_id = m.match_id
			WHERE p.lineup_size = 5
			GROUP BY m.match_id, m.game_start_ts
			ORDER BY m.game_start_ts ASC
		`)
		.all() as FullTeamMatchRow[];

	const results: TeamMatchResult[] = matches.map((match) => {
		if (
			match.startedAt === null ||
			match.participantCount !== 5 ||
			match.minLineupSize !== 5 ||
			match.maxLineupSize !== 5 ||
			match.minWin === null ||
			match.maxWin === null ||
			match.minWin !== match.maxWin
		) {
			throw new Error('Inconsistent data found in a full-team match.');
		}

		return { startedAt: match.startedAt, won: match.maxWin === 1 };
	});

	return calculateOverview(results);
}

function calculateOverview(matches: readonly TeamMatchResult[]): TeamOverview {
	const chronological = [...matches].sort((left, right) => left.startedAt - right.startedAt);
	const outcomes: MatchOutcome[] = chronological.map((match) => (match.won ? 'win' : 'loss'));
	const winCount = outcomes.filter((outcome) => outcome === 'win').length;

	let bestWinStreak = 0;
	let runningWins = 0;
	for (const outcome of outcomes) {
		runningWins = outcome === 'win' ? runningWins + 1 : 0;
		bestWinStreak = Math.max(bestWinStreak, runningWins);
	}

	const latestResult = outcomes.at(-1) ?? null;
	let streakCount = 0;
	for (let index = outcomes.length - 1; index >= 0 && outcomes[index] === latestResult; index -= 1) {
		streakCount += 1;
	}

	return {
		matchCount: outcomes.length,
		winCount,
		lossCount: outcomes.length - winCount,
		winRate: outcomes.length === 0 ? null : winCount / outcomes.length,
		firstMatchAt: chronological[0]?.startedAt ?? null,
		lastMatchAt: chronological.at(-1)?.startedAt ?? null,
		currentStreak: { result: latestResult, count: streakCount },
		bestWinStreak,
		recentForm: outcomes.slice(-RECENT_FORM_SIZE),
	};
}
