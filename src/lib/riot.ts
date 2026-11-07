import 'dotenv/config';

const ROUTING = 'europe'; // routeur régional : europe pour EUW
const TOKEN = process.env.RIOT_API_KEY!;

async function get<T>(path: string): Promise<T> {
    const res = await fetch(`https://${ROUTING}.api.riotgames.com${path}`, {
        headers: { 'X-Riot-Token': TOKEN },
    });
    if (res.status === 429) {
        const wait = Number(res.headers.get('retry-after') ?? 5);
        console.warn(`Rate limit — pause ${wait}s`);
        await new Promise((r) => setTimeout(r, wait * 1000));
        return get(path); // on rejoue
    }
    if (!res.ok) throw new Error(`${res.status} sur ${path}`);
    return res.json() as Promise<T>;
}

/** 
 * Récupère le PUUID d'un joueur à partir de son Riot ID ("pseudo#TAG")
*/
export async function getPuuid(riotId: string): Promise<string> {
    const [name, tag] = riotId.split('#');
    console.log("name:", name)
    console.log("tag:", tag)
    const acc = await get<{ puuid: string }>(
        `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`
    );
    return acc.puuid;
}


interface FlexMatchIdsOptions {
    start?: number;
    count?: number;
    startTime?: number;
    queue?: 440 | 450; // 440 = flex, 450 = solo/duo
}
/**
 * Liste des IDs de matchs flex d'un joueur
 * @param puuid Le PUUID du joueur
 * @param count Le nombre de matchs à récupérer, défaut 20
 * @returns Une liste des IDs de matchs flex
 */
export async function getFlexMatchIds(puuid: string, { start = 0, count = 20, startTime, queue = 440 }: FlexMatchIdsOptions): Promise<string[]> {
    const type = 'ranked';

    return get<string[]>(
        `/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${queue}&type=${type}&count=${count}${startTime ? `&startTime=${startTime}` : ''}&start=${start}`
    );
}

/**
 * Récupère les détails d'un match à partir de son ID
 * @param matchId L'ID du match à récupérer
 * @returns Les détails du match
 */
export async function getMatch(matchId: string): Promise<any> {
    return get(`/lol/match/v5/matches/${matchId}`);
}