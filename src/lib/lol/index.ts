import type { Position } from '../types';
import type { OpggIconName } from '../opgg-icons';
import championNames from './champion-names.json';

/** Identifiants Match-V5 qui diffèrent de ceux de Data Dragon. */
const DATA_DRAGON_IDS: Record<string, string> = { FiddleSticks: 'Fiddlesticks' };

const names: Record<string, string> = championNames;
const assetUrls: Record<string, string> = typeof __RIOT_ASSETS__ === 'undefined' ? {} : __RIOT_ASSETS__;

function riotAsset(path: string): string {
	return assetUrls[path] ?? path;
}

export function championId(riotChampionName: string): string {
	return DATA_DRAGON_IDS[riotChampionName] ?? riotChampionName;
}

export function championName(riotChampionName: string): string {
	const id = championId(riotChampionName);
	return names[id] ?? id;
}

export function championIcon(riotChampionName: string): string {
	return riotAsset(`/riot/champions/${championId(riotChampionName)}.png`);
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

const ROLE_ICONS: Record<Position, OpggIconName> = {
	TOP: 'role-top',
	JUNGLE: 'role-jungle',
	MIDDLE: 'role-mid',
	BOTTOM: 'role-adc',
	UTILITY: 'role_support',
};

export function roleIcon(role: Position | null): OpggIconName {
	return role === null ? 'ui-questionmark-circle' : ROLE_ICONS[role];
}

/** Tri stable par rôle (Top → Support), les rôles inconnus en dernier. */
export function compareRoles(left: Position | null, right: Position | null): number {
	const rank = (role: Position | null) => (role === null ? ROLE_ORDER.length : ROLE_ORDER.indexOf(role));
	return rank(left) - rank(right);
}

const TIER_LABELS: Record<string, string> = {
	IRON: 'Fer',
	BRONZE: 'Bronze',
	SILVER: 'Argent',
	GOLD: 'Or',
	PLATINUM: 'Platine',
	EMERALD: 'Émeraude',
	DIAMOND: 'Diamant',
	MASTER: 'Maître',
	GRANDMASTER: 'Grand Maître',
	CHALLENGER: 'Challenger',
};

/** Libellé français d'un rang Riot, division incluse quand elle a du sens. */
export function tierLabel(tier: string, division?: string | null): string {
	const label = TIER_LABELS[tier.toUpperCase()] ?? tier;
	const apex = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier.toUpperCase());
	return division && !apex ? `${label} ${division}` : label;
}

export function rankEmblem(tier: string): string | null {
	const key = tier.toUpperCase();
	return key in TIER_LABELS ? riotAsset(`/riot/ranks/emblem-${key.toLowerCase()}.png`) : null;
}

export function profileIcon(puuid: string): string {
	return riotAsset(`/riot/profiles/${puuid}.png`);
}
