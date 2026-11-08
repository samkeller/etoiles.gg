import type { MatchSummary } from './matches';

export interface TeamSession {
	dateKey: string;
	startedAt: number;
	endedAt: number;
	matches: MatchSummary[];
	wins: number;
	losses: number;
}

const SESSION_GAP_MS = 4 * 60 * 60 * 1000;

function parisDateKey(timestamp: number): string {
	return new Intl.DateTimeFormat('sv-SE', {
		timeZone: 'Europe/Paris',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(new Date(timestamp));
}

/** Groups complete five-player matches into evenings, including sessions that pass midnight. */
export function getTeamSessions(matches: readonly MatchSummary[]): TeamSession[] {
	const chronological = [...matches].sort((left, right) => left.startedAt - right.startedAt || left.id.localeCompare(right.id));
	const sessions: TeamSession[] = [];

	for (const match of chronological) {
		let session = sessions.at(-1);
		if (!session || match.startedAt - session.endedAt > SESSION_GAP_MS) {
			session = {
				dateKey: parisDateKey(match.startedAt),
				startedAt: match.startedAt,
				endedAt: match.startedAt,
				matches: [],
				wins: 0,
				losses: 0,
			};
			sessions.push(session);
		}
		session.endedAt = match.startedAt;
		session.matches.push(match);
		if (match.outcome === 'win') session.wins += 1;
		else session.losses += 1;
	}

	return sessions.reverse().map((session) => ({
		...session,
		matches: session.matches.slice().reverse(),
	}));
}
