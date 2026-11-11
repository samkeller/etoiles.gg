import type { DraftMatch, DraftPick } from '../../lib/stats/draft';
import type { Position } from '../../lib/types';

export interface DraftSeatRecord {
	champion: string;
	games: number;
	wins: number;
}

export interface DraftSeatData {
	puuid: string;
	name: string;
	role: Position | null;
	pool: readonly DraftSeatRecord[];
	explore: readonly DraftSeatRecord[];
}

export interface DraftCompositionData {
	champions: string[];
	games: number;
	wins: number;
	lastPlayedAt: number;
	latestMatchId: string;
}

export interface DraftOpponentRecord {
	champion: string;
	games: number;
	wins: number;
}

export interface DraftBanRecord extends DraftOpponentRecord {
	bans: number;
}

export interface DraftAppData {
	seats: readonly DraftSeatData[];
	matches: readonly DraftMatch[];
	compositions: readonly DraftCompositionData[];
	champions: readonly { id: string; name: string }[];
	minimumGames: number;
	initialPicks: readonly (string | null)[];
	banRecords: readonly DraftBanRecord[];
	opponentRecords: readonly DraftOpponentRecord[];
	renderedAt: number;
}

export type { DraftPick };
