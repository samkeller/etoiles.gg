import 'dotenv/config';
import type { MatchDto } from './types';
import { request } from './backendHttp';
import { validateMatch } from './matchValidation';

export function riotHeaders(): Record<string, string> {
    const token = process.env.RIOT_API_KEY?.trim();
    if (!token || !/^RGAPI-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(token)) {
        throw new Error('RIOT_API_KEY is missing or invalid');
    }
    return { 'X-Riot-Token': token };
}

export function parseRiotId(riotId: string): [string, string] {
    const parts = riotId.trim().split('#');
    if (parts.length !== 2 || parts.some((part) => !part.trim() || /[\u0000-\u001f/\\]/.test(part))) {
        throw new Error('Invalid Riot ID; expected name#tag');
    }
    return [parts[0].trim(), parts[1].trim()];
}

async function get(path: string): Promise<unknown> {
    return (await request(`https://europe.api.riotgames.com${path}`, { headers: riotHeaders() })).json();
}

/** 
 * Récupère le PUUID d'un joueur à partir de son Riot ID ("pseudo#TAG")
*/
export async function getPuuid(riotId: string): Promise<string> {
    const [name, tag] = parseRiotId(riotId);
    const acc = await get(
        `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`
    );
    if (!acc || typeof acc !== 'object' || !('puuid' in acc) || typeof acc.puuid !== 'string' || !acc.puuid) {
        throw new Error('Invalid Riot account response');
    }
    return acc.puuid;
}


export interface FlexMatchIdsOptions {
    start?: number;
    count?: number;
    startTime?: number;
    queue?: 440 | 420; // 440 = flex, 420 = solo/duo
}
/**
 * Liste des IDs de matchs flex d'un joueur
 * @param puuid Le PUUID du joueur
 * @param count Le nombre de matchs à récupérer, défaut 20
 * @returns Une liste des IDs de matchs flex
 */
export async function getFlexMatchIds(puuid: string, { start = 0, count = 20, startTime, queue = 440 }: FlexMatchIdsOptions): Promise<string[]> {
    if (!puuid || !Number.isInteger(start) || start < 0 || !Number.isInteger(count) || count < 1 || count > 100 ||
        (startTime !== undefined && (!Number.isInteger(startTime) || startTime < 0))) throw new Error('Invalid match list parameters');
    const params = new URLSearchParams({ queue: String(queue), type: 'ranked', count: String(count), start: String(start) });
    if (startTime !== undefined) params.set('startTime', String(startTime));
    const ids = await get(`/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?${params}`);
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string' && /^[A-Z0-9]{2,8}_\d{1,20}$/.test(id))) {
        throw new Error('Invalid Riot match list response');
    }
    return ids;
}

/**
 * Récupère les détails d'un match à partir de son ID
 * @param matchId L'ID du match à récupérer
 * @returns Les détails du match
 */
export async function getMatch(matchId: string): Promise<MatchDto> {
    if (!/^[A-Z0-9]{2,8}_\d{1,20}$/.test(matchId)) throw new Error('Invalid match ID');
    return validateMatch(await get(`/lol/match/v5/matches/${matchId}`), matchId);
}