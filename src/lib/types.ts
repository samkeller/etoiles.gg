/** Réponses effectivement consommées de l'API Riot — le reste est ignoré */

export interface AccountDto {
    puuid: string;
    gameName: string;
    tagLine: string;
}

export interface LeagueEntryDto {
    queueType: string;
    tier: string;
    rank: string;
    leaguePoints: number;
    wins: number;
    losses: number;
}

export interface ParticipantDto {
    puuid: string;
    teamId: TeamId;
    championName: string;
    /** Clé numérique Data Dragon ; sert à résoudre les bans. */
    championId?: number;
    champLevel: number;
    individualPosition: Position | 'Invalid';
    kills: number;
    deaths: number;
    assists: number;
    win: boolean;
    riotIdGameName: string;
    riotIdTagline: string;
    totalMinionsKilled: number;
    neutralMinionsKilled: number;
    goldEarned: number;
    totalDamageDealtToChampions: number;
    visionScore: number;
    summoner1Id?: number;
    summoner2Id?: number;
    pentaKills?: number;
    quadraKills?: number;
    gameEndedInEarlySurrender?: boolean;
}

export type Position = | 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY';

export type TeamId = 100 | 200;

export type ObjectiveName = 'baron' | 'champion' | 'dragon' | 'horde' | 'inhibitor' | 'riftHerald' | 'tower';

export interface TeamDto {
    teamId: TeamId;
    win: boolean;
    objectives: Record<ObjectiveName, { first: boolean; kills: number }>;
    /** Absent des très anciennes réponses ; championId vaut -1 pour un ban non utilisé. */
    bans?: { championId: number; pickTurn: number }[];
}

export interface MatchInfoDto {
    gameCreation: number;      // ms epoch
    gameDuration: number;       // secondes
    gameVersion: string;
    platformId: string;
    queueId: number;
    participants: ParticipantDto[];
    teams: TeamDto[];
}

export interface MatchDto {
    metadata: { matchId: string };
    info: MatchInfoDto;
}

/** Entité interne (DB), distincte du DTO : déjà shape pour nos tables */
export interface PlayerRow {
    puuid: string;
    game_name: string | null;
    tag_line: string | null;
}