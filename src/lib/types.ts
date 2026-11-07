/** Réponses effectivement consommées de l'API Riot — le reste est ignoré */

export interface AccountDto {
    puuid: string;
    gameName: string;
    tagLine: string;
}

export interface ParticipantDto {
    puuid: string;
    championName: string;
    individualPosition: Position;
    kills: number;
    deaths: number;
    assists: number;
    win: boolean;
    riotIdGameName: string;
    riotIdTagLine: string;
}

export type Position = | 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY';

export interface MatchInfoDto {
    gameCreation: number;      // ms epoch
    gameDuration: number;       // secondes
    queueId: number;
    participants: ParticipantDto[];
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