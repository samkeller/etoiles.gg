import type { Position } from '../types';
import championNames from './champion-names.json';

/** Identifiants Match-V5 qui diffèrent de ceux de Data Dragon. */
const DATA_DRAGON_IDS: Record<string, string> = { FiddleSticks: 'Fiddlesticks' };

const names: Record<string, string> = championNames;

export function championId(riotChampionName: string): string {
	return DATA_DRAGON_IDS[riotChampionName] ?? riotChampionName;
}

export function championName(riotChampionName: string): string {
	const id = championId(riotChampionName);
	return names[id] ?? id;
}

export function championIcon(riotChampionName: string): string {
	return `/riot/champions/${championId(riotChampionName)}.png`;
}

export const ROLE_ORDER: readonly Position[] = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

const ROLE_LABELS: Record<Position, string> = {
	TOP: 'Top',
	JUNGLE: 'Jungle',
	MIDDLE: 'Mid',
	BOTTOM: 'ADC',
	UTILITY: 'Support',
};

export function isPosition(value: string | null | undefined): value is Position {
	return ROLE_ORDER.includes(value as Position);
}

export function roleLabel(role: Position | null): string {
	return role === null ? 'Rôle inconnu' : ROLE_LABELS[role];
}

export function roleIcon(role: Position | null): string {
	return `/riot/positions/icon-position-${role === null ? 'fill' : role.toLowerCase()}.png`;
}

/** Tri stable par rôle (Top → Support), les rôles inconnus en dernier. */
export function compareRoles(left: Position | null, right: Position | null): number {
	const rank = (role: Position | null) => (role === null ? ROLE_ORDER.length : ROLE_ORDER.indexOf(role));
	return rank(left) - rank(right);
}

export function profileIcon(puuid: string): string {
	return `/riot/profiles/${puuid}.png`;
}
