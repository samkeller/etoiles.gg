import type Database from 'better-sqlite3';
import { championId, isPosition } from '../lol';
import { validateMatch } from '../matchValidation';
import type { Position } from '../types';
import type { MatchOutcome } from './shared';
import type { ChampionRecord, RoleShare } from './players';

export type RankedQueue = 'soloDuo' | 'flex';

export interface RankedMatch {
	id: string;
	startedAt: number;
	queue: RankedQueue;
	patch: string;
	champion: string;
	role: Position | null;
	outcome: MatchOutcome;
	kills: number;
	deaths: number;
	assists: number;
}

export interface RankSnapshot {
	capturedOn: string;
	tier: string | null;
	division: string | null;
	leaguePoints: number | null;
	wins: number | null;
	losses: number | null;
}

export interface IndividualChampionRecord extends ChampionRecord {
	lastPlayedAt: number;
	roles: RoleShare[];
}

export interface RankedActivity {
	games: number;
	wins: number;
	winRate: number | null;
	lastPlayedAt: number | null;
	champions: IndividualChampionRecord[];
	roles: RoleShare[];
	recentMatches: RankedMatch[];
	currentRank: RankSnapshot | null;
	rankHistory: RankSnapshot[];
}

export interface IndividualProfile {
	puuid: string;
	name: string;
	tagLine: string | null;
	soloDuo: RankedActivity;
	flex: RankedActivity;
}

interface PlayerRow {
	puuid: string;
	name: string | null;
	tagLine: string | null;
}

interface MatchRow {
	id: string;
	startedAt: number | null;
	queueId: number;
	rawJson: string | null;
}

interface SnapshotRow extends RankSnapshot {
	puuid: string;
	queueType: 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR';
}

const EMPTY_ACTIVITY: Omit<RankedActivity, 'currentRank' | 'rankHistory'> = {
	games: 0,
	wins: 0,
	winRate: null,
	lastPlayedAt: null,
	champions: [],
	roles: [],
	recentMatches: [],
};

function activityFor(matches: readonly RankedMatch[], rankHistory: RankSnapshot[]): RankedActivity {
	const wins = matches.filter((match) => match.outcome === 'win').length;
	const championCounts = new Map<string, { record: IndividualChampionRecord; roles: Map<Position, number> }>();
	const roleCounts = new Map<Position, number>();
	for (const match of matches) {
		const champion = championId(match.champion);
		const item = championCounts.get(champion) ?? {
			record: { champion, games: 0, wins: 0, lastPlayedAt: match.startedAt, roles: [] },
			roles: new Map<Position, number>(),
		};
		const record = item.record;
		record.games += 1;
		record.wins += Number(match.outcome === 'win');
		record.lastPlayedAt = Math.max(record.lastPlayedAt, match.startedAt);
		if (match.role) {
			item.roles.set(match.role, (item.roles.get(match.role) ?? 0) + 1);
			roleCounts.set(match.role, (roleCounts.get(match.role) ?? 0) + 1);
		}
		championCounts.set(champion, item);
	}
	const champions = [...championCounts.values()].map(({ record, roles }) => ({
		...record,
		roles: [...roles].map(([role, games]) => ({ role, games })).sort((left, right) => right.games - left.games),
	}));

	const newestFirst = [...matches].sort((left, right) => right.startedAt - left.startedAt || left.id.localeCompare(right.id));
	return {
		...EMPTY_ACTIVITY,
		games: matches.length,
		wins,
		winRate: matches.length === 0 ? null : wins / matches.length,
		lastPlayedAt: newestFirst[0]?.startedAt ?? null,
		champions: champions.sort(
			(left, right) => right.games - left.games || right.wins - left.wins || left.champion.localeCompare(right.champion),
		),
		roles: [...roleCounts].map(([role, games]) => ({ role, games })).sort((left, right) => right.games - left.games),
		recentMatches: newestFirst.slice(0, 30),
		currentRank: rankHistory.at(-1) ?? null,
		rankHistory,
	};
}

function rankHistories(rows: readonly SnapshotRow[]): Map<string, { soloDuo: RankSnapshot[]; flex: RankSnapshot[] }> {
	const histories = new Map<string, { soloDuo: RankSnapshot[]; flex: RankSnapshot[] }>();
	for (const row of rows) {
		const history = histories.get(row.puuid) ?? { soloDuo: [], flex: [] };
		const target = row.queueType === 'RANKED_SOLO_5x5' ? history.soloDuo : history.flex;
		target.push({
			capturedOn: row.capturedOn,
			tier: row.tier,
			division: row.division,
			leaguePoints: row.leaguePoints,
			wins: row.wins,
			losses: row.losses,
		});
		histories.set(row.puuid, history);
	}
	return histories;
}

export function getIndividualProfiles(database: Database.Database): IndividualProfile[] {
	const players = database.prepare('SELECT puuid, game_name AS name, tag_line AS tagLine FROM players')
		.all() as PlayerRow[];
	const tracked = new Map(players.map((player) => [player.puuid, player]));
	const matches = database.prepare(`SELECT match_id AS id, game_start_ts AS startedAt, queue_id AS queueId, raw_json AS rawJson
		FROM matches WHERE queue_id IN (420, 440) ORDER BY game_start_ts DESC, match_id`).all() as MatchRow[];
	const games = new Map<string, { soloDuo: RankedMatch[]; flex: RankedMatch[] }>(
		players.map(({ puuid }) => [puuid, { soloDuo: [], flex: [] }]),
	);

	for (const match of matches) {
		if (!match.rawJson || match.startedAt === null) throw new Error(`Missing raw data for ranked match ${match.id}.`);
		const { info } = validateMatch(JSON.parse(match.rawJson), match.id);
		if (info.queueId !== 420 && info.queueId !== 440) {
			throw new Error(`Unexpected queue in ranked match ${match.id}.`);
		}
		if (info.queueId !== match.queueId) throw new Error(`Inconsistent queue for ranked match ${match.id}.`);
		if (info.gameCreation !== match.startedAt) throw new Error(`Inconsistent start time for ranked match ${match.id}.`);
		const queue: RankedQueue = info.queueId === 420 ? 'soloDuo' : 'flex';
		for (const participant of info.participants) {
			if (!tracked.has(participant.puuid)) continue;
			const target = games.get(participant.puuid);
			if (!target) continue;
			target[queue].push({
				id: match.id,
				startedAt: match.startedAt,
				queue,
				patch: info.gameVersion.split('.').slice(0, 2).join('.'),
				champion: championId(participant.championName),
				role: isPosition(participant.individualPosition) ? participant.individualPosition : null,
				outcome: participant.win ? 'win' : 'loss',
				kills: participant.kills,
				deaths: participant.deaths,
				assists: participant.assists,
			});
		}
	}

	const snapshots = database.prepare(`SELECT puuid, queue_type AS queueType, captured_on AS capturedOn,
		tier, division, league_points AS leaguePoints, wins, losses
		FROM rank_snapshots ORDER BY captured_on, queue_type`).all() as SnapshotRow[];
	const ranks = rankHistories(snapshots);

	return players.map((player) => {
		const history = ranks.get(player.puuid) ?? { soloDuo: [], flex: [] };
		const activity = games.get(player.puuid) ?? { soloDuo: [], flex: [] };
		return {
			puuid: player.puuid,
			name: player.name ?? 'Étoile inconnue',
			tagLine: player.tagLine,
			soloDuo: activityFor(activity.soloDuo, history.soloDuo),
			flex: activityFor(activity.flex, history.flex),
		};
	});
}
