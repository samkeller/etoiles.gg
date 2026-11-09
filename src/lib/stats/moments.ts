import type Database from 'better-sqlite3';
import { formatCompact, formatDuration, pluralize } from '../format';
import { championId, championName } from '../lol';
import { cachedRead } from './cache';
import { getTeamFacts, type TeamFact } from './facts';
import { getTeamSessions } from './sessions';

export interface TeamMoment {
	id: string;
	kind: 'fastest' | 'longest' | 'kills' | 'streak' | 'night' | 'penta' | 'quadra' | 'comeback';
	title: string;
	value: string;
	startedAt: number;
	matchIds: string[];
	puuid?: string;
	champion?: string;
}

export interface TeamStories {
	games: number;
	multikillCoverage: number;
	timelineCoverage: number;
	records: TeamMoment[];
	events: TeamMoment[];
	recent: TeamMoment[];
}

export const COMEBACK_DEFICIT = 5000;
export const MIN_RECORD_DURATION_S = 600;

export function buildTeamStories(facts: readonly TeamFact[]): TeamStories {
	const chronological = [...facts].sort((a, b) => a.match.startedAt - b.match.startedAt || a.match.id.localeCompare(b.match.id));
	const games = chronological.map((fact) => fact.match);
	const records: TeamMoment[] = [];
	const events: TeamMoment[] = [];
	const eligible = chronological.filter((fact) => !fact.earlySurrender && fact.match.durationS >= MIN_RECORD_DURATION_S);
	const record = (kind: TeamMoment['kind'], title: string, value: string, fact: TeamFact) => {
		const item = { id: `${kind}:${fact.match.id}`, kind, title, value, startedAt: fact.match.startedAt, matchIds: [fact.match.id] };
		records.push(item);
		events.push(item);
	};
	const fastest = eligible.filter((fact) => fact.match.outcome === 'win')
		.sort((a, b) => a.match.durationS - b.match.durationS || b.match.startedAt - a.match.startedAt)[0];
	if (fastest) record('fastest', 'Victoire éclair', formatDuration(fastest.match.durationS), fastest);
	const longest = [...eligible].sort((a, b) => b.match.durationS - a.match.durationS || b.match.startedAt - a.match.startedAt)[0];
	if (longest) record('longest', 'Jusqu’au bout', formatDuration(longest.match.durationS), longest);
	const kills = [...eligible].sort((a, b) => b.match.kills - a.match.kills || b.match.startedAt - a.match.startedAt)[0];
	if (kills && kills.match.kills > 0) record('kills', 'Feu d’artifice collectif', pluralize(kills.match.kills, 'élimination'), kills);

	let run: typeof games = [];
	let bestRun: typeof games = [];
	const closeRun = () => {
		if (run.length >= 3) events.push({
			id: `streak:${run[0].id}`, kind: 'streak', title: 'Victoires d’affilée',
			value: pluralize(run.length, 'victoire'), startedAt: run.at(-1)!.startedAt,
			matchIds: run.map((match) => match.id),
		});
		if (run.length >= bestRun.length) bestRun = [...run];
		run = [];
	};
	for (const match of games) {
		if (match.outcome === 'win') run.push(match);
		else closeRun();
	}
	closeRun();
	if (bestRun.length >= 3) records.push({
		id: `best-streak:${bestRun[0].id}`, kind: 'streak', title: 'Notre plus belle série',
		value: pluralize(bestRun.length, 'victoire'), startedAt: bestRun.at(-1)!.startedAt,
		matchIds: bestRun.map((match) => match.id),
	});
	const perfect = getTeamSessions(games).filter((session) => session.losses === 0 && session.wins >= 3);
	for (const session of perfect) events.push({
		id: `night:${session.matches[0].id}`, kind: 'night', title: 'Soirée sans faute',
		value: `${session.wins} V · 0 D`, startedAt: session.endedAt, matchIds: session.matches.map((match) => match.id),
	});
	const bestNight = [...perfect].sort((a, b) => b.wins - a.wins || b.startedAt - a.startedAt)[0];
	if (bestNight) records.push({
		id: `best-night:${bestNight.matches[0].id}`, kind: 'night', title: 'Notre soirée parfaite',
		value: `${bestNight.wins} V · 0 D`, startedAt: bestNight.endedAt, matchIds: bestNight.matches.map((match) => match.id),
	});
	for (const fact of chronological) {
		for (const player of fact.players) {
			const kind = player.pentaKills ? 'penta' : player.quadraKills ? 'quadra' : null;
			if (!kind) continue;
			const member = fact.match.members.find((member) => member.puuid === player.puuid)!;
			events.push({
				id: `${kind}:${fact.match.id}:${player.puuid}`, kind,
				title: `${kind === 'penta' ? 'Pentakill' : 'Quadrakill'} · ${member.name}`,
				value: `${kind === 'penta' ? player.pentaKills : player.quadraKills} × ${championName(player.championName)}`,
				startedAt: fact.match.startedAt, matchIds: [fact.match.id],
				puuid: player.puuid, 
				champion: championId(player.championName),
			});
		}
		if (fact.match.outcome === 'win' && fact.timeline.status === 'ready') {
			const deficit = -Math.min(0, ...fact.timeline.summary.gold.map((frame) => frame.diff));
			if (deficit >= COMEBACK_DEFICIT) events.push({
				id: `comeback:${fact.match.id}`, kind: 'comeback', title: 'Rien n’était joué',
				value: `Victoire après −${formatCompact(deficit)} or`, startedAt: fact.match.startedAt, matchIds: [fact.match.id],
			});
		}
	}
	events.sort((a, b) => b.startedAt - a.startedAt || a.id.localeCompare(b.id));
	const latestIds = new Set(games.slice(-10).map((match) => match.id));
	const recent: TeamMoment[] = [];
	const seenMatches = new Set<string>();
	// Prefer exceptional events to a routine record on the same match.
	const priority = ['penta', 'comeback', 'quadra', 'night', 'streak', 'fastest', 'kills', 'longest'];
	const candidates = events.filter((event) => latestIds.has(event.matchIds.at(-1)!) || latestIds.has(event.matchIds[0]))
		.sort((a, b) => b.startedAt - a.startedAt || priority.indexOf(a.kind) - priority.indexOf(b.kind));
	for (const event of candidates) {
		const matchId = event.matchIds[0];
		if (seenMatches.has(matchId)) continue;
		seenMatches.add(matchId);
		recent.push(event);
		if (recent.length === 3) break;
	}
	return {
		games: facts.length, records, events, recent,
		multikillCoverage: facts.filter((fact) => fact.players.every((player) => player.pentaKills !== undefined && player.quadraKills !== undefined)).length,
		timelineCoverage: facts.filter((fact) => fact.timeline.status === 'ready').length,
	};
}

export function getTeamStories(database: Database.Database): TeamStories {
	return cachedRead(database, 'team-stories', () => buildTeamStories(getTeamFacts(database)));
}

export function getMatchMoments(database: Database.Database, matchId: string): TeamMoment[] {
	return getTeamStories(database).events.filter((event) => event.matchIds.includes(matchId));
}
