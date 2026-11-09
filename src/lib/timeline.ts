import type { MatchDto, TeamId } from './types';

export interface GoldFrame {
	at: number;
	diff: number;
}

export interface TimelineObjective {
	at: number;
	kind: 'dragon' | 'baron' | 'herald' | 'grubs' | 'tower' | 'inhibitor';
	ours: boolean | null;
}

export interface CompactTimeline {
	version: 1;
	gold: GoldFrame[];
	objectives: TimelineObjective[];
}

export const OBJECTIVE_LABELS: Record<TimelineObjective['kind'], string> = {
	dragon: 'Dragon', baron: 'Baron', herald: 'Héraut', grubs: 'Larves',
	tower: 'Tour', inhibitor: 'Inhibiteur',
};

const record = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const nonnegative = (value: unknown): value is number => integer(value) && value >= 0;
const team = (value: unknown): value is TeamId => value === 100 || value === 200;

/** Retain only observed frames and objectives, never inventory, positions or the raw payload. */
export function extractTimeline(value: unknown, match: MatchDto, ourTeam: TeamId): CompactTimeline {
	const fail = (): never => { throw new Error(`Invalid Riot timeline for ${match.metadata.matchId}.`); };
	if (!record(value) || !record(value.metadata) || value.metadata.matchId !== match.metadata.matchId ||
		!record(value.info) || !Array.isArray(value.info.participants) ||
		value.info.participants.length !== 10 || !Array.isArray(value.info.frames) || value.info.frames.length < 2) return fail();
	const sides = new Map<number, TeamId>();
	const puuids = new Set<string>();
	for (const item of value.info.participants) {
		if (!record(item) || !integer(item.participantId) || item.participantId < 1 || item.participantId > 10 ||
			typeof item.puuid !== 'string' || sides.has(item.participantId) || puuids.has(item.puuid)) return fail();
		const participant = match.info.participants.find((candidate) => candidate.puuid === item.puuid);
		if (!participant) return fail();
		puuids.add(item.puuid);
		sides.set(item.participantId, participant.teamId);
	}
	const gold: GoldFrame[] = [];
	const objectives: TimelineObjective[] = [];
	for (const frame of value.info.frames) {
		if (!record(frame) || !nonnegative(frame.timestamp) ||
			frame.timestamp > (match.info.gameDuration + 120) * 1000 ||
			(gold.length > 0 && frame.timestamp <= gold.at(-1)!.at) ||
			!record(frame.participantFrames) || Object.keys(frame.participantFrames).length !== 10 ||
			!Array.isArray(frame.events)) return fail();
		let diff = 0;
		const ids = new Set<number>();
		for (const [key, participant] of Object.entries(frame.participantFrames)) {
			if (!record(participant) || !integer(participant.participantId) || key !== String(participant.participantId) ||
				!sides.has(participant.participantId) || ids.has(participant.participantId) ||
				!nonnegative(participant.totalGold)) return fail();
			ids.add(participant.participantId);
			diff += participant.totalGold * (sides.get(participant.participantId) === ourTeam ? 1 : -1);
		}
		gold.push({ at: frame.timestamp, diff });
		for (const event of frame.events) {
			if (!record(event) || typeof event.type !== 'string') return fail();
			if (event.type !== 'ELITE_MONSTER_KILL' && event.type !== 'BUILDING_KILL') continue;
			if (!nonnegative(event.timestamp) || event.timestamp > (match.info.gameDuration + 120) * 1000) return fail();
			let kind: TimelineObjective['kind'] | undefined;
			if (event.type === 'ELITE_MONSTER_KILL') {
				if (event.monsterType === 'DRAGON') kind = 'dragon';
				if (event.monsterType === 'BARON_NASHOR') kind = 'baron';
				if (event.monsterType === 'RIFTHERALD') kind = 'herald';
				if (event.monsterType === 'HORDE') kind = 'grubs';
			} else {
				if (event.buildingType === 'TOWER_BUILDING') kind = 'tower';
				if (event.buildingType === 'INHIBITOR_BUILDING') kind = 'inhibitor';
			}
			if (!kind) continue;
			const killerSide = team(event.killerTeamId) ? event.killerTeamId :
				integer(event.killerId) ? sides.get(event.killerId) : undefined;
			const side = killerSide ?? (event.type === 'BUILDING_KILL' && team(event.teamId)
				? (event.teamId === 100 ? 200 : 100) : undefined);
			// A neutral objective with an unknown killer stays unattributed.
			const objective = { at: event.timestamp, kind, ours: side === undefined ? null : side === ourTeam };
			objectives.push(objective);
		}
	}
	return { version: 1, gold, objectives: objectives.sort((a, b) => a.at - b.at) };
}

export function parseCompactTimeline(json: string): CompactTimeline {
	const value: unknown = JSON.parse(json);
	const fail = (): never => { throw new Error('Invalid stored timeline summary.'); };
	if (!record(value) || value.version !== 1 || !Array.isArray(value.gold) || value.gold.length < 2 ||
		!Array.isArray(value.objectives)) return fail();
	const gold: GoldFrame[] = [];
	for (const point of value.gold) {
		if (!record(point) || !nonnegative(point.at) || !integer(point.diff) ||
			(gold.length > 0 && point.at <= gold.at(-1)!.at)) return fail();
		gold.push({ at: point.at, diff: point.diff });
	}
	const objectives: TimelineObjective[] = [];
	for (const item of value.objectives) {
		if (!record(item) || !nonnegative(item.at) ||
			typeof item.kind !== 'string' || !Object.hasOwn(OBJECTIVE_LABELS, item.kind) ||
			(item.ours !== true && item.ours !== false && item.ours !== null)) return fail();
		objectives.push({ at: item.at, kind: item.kind as TimelineObjective['kind'], ours: item.ours });
	}
	return { version: 1, gold, objectives };
}
