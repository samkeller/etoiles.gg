import type Database from 'better-sqlite3';
import { championId, championName } from '../lol';
import { cachedRead } from './cache';
import { getTeamFacts, type TeamFact } from './facts';

export interface Discovery {
	id: string;
	title: string;
	text: string;
	context: string;
	matchIds: string[];
	puuid?: string;
	champion?: string;
}

export const DISCOVERY_MIN_GROUP = 10;
export const DISCOVERY_MIN_RATE_GAP = 0.15;

export function buildDiscoveries(facts: readonly TeamFact[]): Discovery[] {
	const recent = [...facts].sort((a, b) => b.match.startedAt - a.match.startedAt || a.match.id.localeCompare(b.match.id));
	const discoveries: Discovery[] = [];
	const ours = recent.filter((fact) => fact.firstDragon === 'ours');
	const theirs = recent.filter((fact) => fact.firstDragon === 'theirs');
	const wins = (group: readonly TeamFact[]) => group.filter((fact) => fact.match.outcome === 'win').length;
	if (ours.length >= DISCOVERY_MIN_GROUP && theirs.length >= DISCOVERY_MIN_GROUP &&
		100 * (wins(ours) * theirs.length - wins(theirs) * ours.length) >=
			(DISCOVERY_MIN_RATE_GAP * 100) * ours.length * theirs.length) {
		discoveries.push({
			id: 'first-dragon', title: 'Autour du premier dragon',
			text: `${wins(ours)} V / ${ours.length} quand nous le prenons, contre ${wins(theirs)} V / ${theirs.length} quand il revient aux adversaires.`,
			context: `Sur ${ours.length + theirs.length} parties à cinq avec un premier dragon attribué. Association observée, pas une preuve de causalité. Seuils : 10 parties par groupe et 15 points d’écart.`,
			matchIds: recent.filter((fact) => fact.firstDragon !== null).map((fact) => fact.match.id),
		});
	}
	const members = recent[0]?.match.members ?? [];
	for (const member of members) {
		const games = recent.filter((fact) => fact.match.members.some((candidate) => candidate.puuid === member.puuid));
		if (games.length < 30) continue;
		const last10 = games.slice(0, 10);
		const previous20 = games.slice(10, 30);
		const championFor = (fact: TeamFact) => championId(fact.match.members.find((candidate) => candidate.puuid === member.puuid)!.champion);
		const oldPicks = new Set(previous20.map(championFor));
		const counts = new Map<string, number>();
		for (const fact of last10) {
			const champion = championFor(fact);
			counts.set(champion, (counts.get(champion) ?? 0) + 1);
		}
		const newPick = [...counts].filter(([champion, count]) => count >= 5 && !oldPicks.has(champion))
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
		if (newPick && !discoveries.some((item) => item.id.startsWith('new-pick:'))) {
			discoveries.push({
				id: `new-pick:${member.puuid}`, puuid: member.puuid, champion: newPick[0],
				title: `${championName(newPick[0])} entre dans la rotation`,
				text: `${member.name} l’a joué ${newPick[1]} fois sur ses 10 dernières parties à cinq, aucune sur les 20 précédentes.`,
				context: 'Deux fenêtres consécutives de 10 et 20 parties à cinq. Un changement d’habitude, pas une recommandation de pick.',
				matchIds: games.slice(0, 30).map((fact) => fact.match.id),
			});
		}
		if (games.length < 40 || discoveries.some((item) => item.id.startsWith('pool:'))) continue;
		const current = games.slice(0, 20);
		const previous = games.slice(20, 40);
		const currentPool = new Set(current.map(championFor)).size;
		const previousPool = new Set(previous.map(championFor)).size;
		if (currentPool >= previousPool + 3) discoveries.push({
			id: `pool:${member.puuid}`, puuid: member.puuid,
			title: 'De nouvelles cordes à son arc',
			text: `${member.name} a joué ${currentPool} champions différents sur ses 20 dernières parties à cinq, contre ${previousPool} sur les 20 précédentes.`,
			context: 'Deux fenêtres consécutives de 20 parties à cinq, au moins 3 champions supplémentaires. La diversité du pool ne mesure pas la performance.',
			matchIds: games.slice(0, 40).map((fact) => fact.match.id),
		});
	}
	return discoveries.slice(0, 3);
}

export function getDiscoveries(database: Database.Database): Discovery[] {
	return cachedRead(database, 'discoveries', () => buildDiscoveries(getTeamFacts(database)));
}
