import type Database from 'better-sqlite3';
import type { MatchOutcome } from './shared';
import { getMatches } from './matches';
import { cachedRead } from './cache';

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

interface TeamMatchResult {
	startedAt: number;
	won: boolean;
}

export function getOverview(database: Database.Database): TeamOverview {
	return cachedRead(database, 'overview', () => queryOverview(database));
}

function queryOverview(database: Database.Database): TeamOverview {
	const matches = getMatches(database, 'full');
	const results: TeamMatchResult[] = matches.map((match) => ({
		startedAt: match.startedAt,
		won: match.outcome === 'win',
	}));
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
