import 'dotenv/config';
import type { LeagueEntryDto, MatchDto } from './types';
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
    return (await request(`https://europe.api.riotgames.com${path}`, {
        headers: riotHeaders(),
        timeoutMs: 30_000,
        maxRetryAfterMs: 5 * 60_000,
    })).json();
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

export const getRankedMatchIds = getFlexMatchIds;

/**
 * Récupère les détails d'un match à partir de son ID
 * @param matchId L'ID du match à récupérer
 * @returns Les détails du match
 */
export async function getMatch(matchId: string): Promise<MatchDto> {
    if (!/^[A-Z0-9]{2,8}_\d{1,20}$/.test(matchId)) throw new Error('Invalid match ID');
    return validateMatch(await get(`/lol/match/v5/matches/${matchId}`), matchId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateLeagueEntries(value: unknown): LeagueEntryDto[] {
    if (!Array.isArray(value)) throw new Error('Invalid Riot league entries response');
    return value.map((entry) => {
        if (!isRecord(entry) ||
            typeof entry.queueType !== 'string' || !/^[A-Z0-9_x]+$/.test(entry.queueType) ||
            typeof entry.tier !== 'string' || !/^[A-Z_]+$/.test(entry.tier) ||
            typeof entry.rank !== 'string' || !/^[IVX]+$/.test(entry.rank) ||
            !Number.isSafeInteger(entry.leaguePoints) || (entry.leaguePoints as number) < 0 ||
            !Number.isSafeInteger(entry.wins) || (entry.wins as number) < 0 ||
            !Number.isSafeInteger(entry.losses) || (entry.losses as number) < 0) {
            throw new Error('Invalid Riot league entries response');
        }
        return {
            queueType: entry.queueType,
            tier: entry.tier,
            rank: entry.rank,
            leaguePoints: entry.leaguePoints as number,
            wins: entry.wins as number,
            losses: entry.losses as number,
        };
    });
}

export async function getRankEntries(puuid: string): Promise<LeagueEntryDto[]> {
    if (!puuid || /[\u0000-\u001f/\\]/.test(puuid)) throw new Error('Invalid PUUID');
    const platform = (process.env.RIOT_PLATFORM ?? 'euw1').trim().toLowerCase();
    if (!/^(br1|eun1|euw1|jp1|kr|la1|la2|na1|oc1|ph2|ru|sg2|th2|tr1|tw2|vn2)$/.test(platform)) {
        throw new Error('RIOT_PLATFORM is invalid');
    }
    const response = await request(`https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`, {
        headers: riotHeaders(),
        timeoutMs: 30_000,
        maxRetryAfterMs: 5 * 60_000,
    });
    return validateLeagueEntries(await response.json());
}