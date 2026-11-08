import type { MatchDto } from './types';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

export function validateMatch(value: unknown, expectedId?: string): MatchDto {
	assertMatchDto(value, expectedId);
	return value;
}

export function assertMatchDto(value: unknown, expectedId?: string): asserts value is MatchDto {
	const fail = (): never => { throw new Error(`Malformed raw match data${expectedId ? ` for ${expectedId}` : ''}.`); };
	if (!record(value) || !record(value.metadata) || !text(value.metadata.matchId) ||
		!/^[A-Z0-9]{2,8}_\d{1,20}$/.test(value.metadata.matchId) ||
		(expectedId !== undefined && value.metadata.matchId !== expectedId) || !record(value.info)) return fail();
	const info = value.info;
	if (!nonnegative(info.gameCreation) || !nonnegative(info.gameDuration) || !nonnegative(info.queueId) ||
		!text(info.gameVersion) || !text(info.platformId) || !Array.isArray(info.participants) ||
		info.participants.length !== 10 || !Array.isArray(info.teams) || info.teams.length !== 2) return fail();
	if (value.metadata.matchId.split('_')[0] !== info.platformId) return fail();
	const puuids = new Set<string>();
	for (const participant of info.participants) {
		if (!record(participant) || !text(participant.puuid) || puuids.has(participant.puuid) ||
			(participant.teamId !== 100 && participant.teamId !== 200) || !text(participant.championName) ||
			typeof participant.individualPosition !== 'string' || typeof participant.win !== 'boolean' ||
			!['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY', 'Invalid'].includes(participant.individualPosition) ||
			typeof participant.riotIdGameName !== 'string' || typeof participant.riotIdTagline !== 'string' ||
			!['summoner1Id', 'summoner2Id'].every((key) => participant[key] === undefined ||
				(typeof participant[key] === 'number' && Number.isSafeInteger(participant[key]) && participant[key] > 0)) ||
			!['kills', 'deaths', 'assists', 'champLevel', 'totalMinionsKilled', 'neutralMinionsKilled',
				'goldEarned', 'totalDamageDealtToChampions', 'visionScore'].every((key) => nonnegative(participant[key]))) return fail();
		puuids.add(participant.puuid);
	}
	const teamIds = new Set<number>();
	for (const team of info.teams) {
		if (!record(team) || (team.teamId !== 100 && team.teamId !== 200) || teamIds.has(team.teamId) ||
			typeof team.win !== 'boolean' || !record(team.objectives)) return fail();
		teamIds.add(team.teamId);
		const participants = info.participants.filter((p) => p.teamId === team.teamId);
		if (participants.length !== 5 || participants.some((p) => p.win !== team.win)) return fail();
		const objectives = team.objectives;
		if (!['baron', 'champion', 'dragon', 'horde', 'inhibitor', 'riftHerald', 'tower'].every((key) => record(objectives[key]))) return fail();
		for (const objective of Object.values(objectives)) {
			if (!record(objective) || typeof objective.first !== 'boolean' || !nonnegative(objective.kills)) return fail();
		}
	}
	if (info.teams[0].win === info.teams[1].win) return fail();
}
