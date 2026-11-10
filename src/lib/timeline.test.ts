import { afterEach, describe, expect, it } from 'vitest';
import { extractTimeline, parseCompactTimeline } from './timeline';
import { addMatch, closeTestDatabases, createTestDatabase, fullLineup, timelineFixture } from './stats/fixtures';
import type { MatchDto } from './types';

afterEach(closeTestDatabases);
function fixture() {
	const db = createTestDatabase();
	addMatch(db, { id: 'EUW1_1', startedAt: 1, won: true, members: fullLineup() });
	const match: MatchDto = JSON.parse((db.prepare('SELECT raw_json AS json FROM matches').get() as { json: string }).json);
	return { match, timeline: timelineFixture(match) };
}

describe('compact Match-V5 timeline', () => {
	it('extracts actual timestamps, gold and objective ownership, including a tower with no killer', () => {
		const { match, timeline } = fixture();
		const compact = extractTimeline(timeline, match, 100);
		expect(compact.gold).toEqual([{ at: 0, diff: 0 }, { at: 60000, diff: -6000 }, { at: 120000, diff: 1000 }]);
		expect(compact.objectives).toEqual([
			{ at: 55000, kind: 'dragon', ours: true },
			{ at: 60000, kind: 'tower', ours: false },
		]);
		expect(parseCompactTimeline(JSON.stringify(compact))).toEqual(compact);
		expect(JSON.stringify(compact)).not.toContain('puuid');
		expect(JSON.stringify(compact)).not.toContain('participantFrames');
	});

	it('resolves teams through PUUIDs rather than array order and reverses the perspective for red side', () => {
		const { match, timeline } = fixture();
		match.info.participants.reverse();
		timeline.info.participants.reverse();
		const compact = extractTimeline(timeline, match, 200);
		expect(compact.gold[1].diff).toBe(6000);
		expect(compact.objectives.map((event) => event.ours)).toEqual([false, true]);
	});

	it('does not attribute unknown neutral killers and tolerates new event kinds', () => {
		const { match, timeline } = fixture();
		timeline.info.frames[1].events[0].killerId = 0;
		timeline.info.frames[2].events.push({ type: 'FUTURE_EVENT', timestamp: 120000, killerId: 1, monsterType: 'UNKNOWN' });
		expect(extractTimeline(timeline, match, 100).objectives[0].ours).toBeNull();
	});

	it('uses an explicit killer team when available, including neutral kills without a participant', () => {
		const { match, timeline } = fixture();
		const raw = { ...timeline, info: { ...timeline.info, frames: timeline.info.frames.map((frame, i) => ({
			...frame, events: i === 1 ? [
				{ type: 'ELITE_MONSTER_KILL', timestamp: 55000, monsterType: 'BARON_NASHOR', killerId: 0, killerTeamId: 200 },
				{ type: 'ELITE_MONSTER_KILL', timestamp: 56000, monsterType: 'UNKNOWN_FUTURE_MONSTER', killerId: 1 },
			] : [],
		})) } };
		expect(extractTimeline(raw, match, 100).objectives).toEqual([{ at: 55000, kind: 'baron', ours: false }]);
	});

	it('preserves simultaneous monster kills rather than merging distinct objectives with the same timestamp', () => {
		const { match, timeline } = fixture();
		const raw = { ...timeline, info: { ...timeline.info, frames: timeline.info.frames.map((frame, i) => ({
			...frame, events: i === 1 ? Array.from({ length: 3 }, () => ({
				type: 'ELITE_MONSTER_KILL', timestamp: 55000, monsterType: 'HORDE', killerTeamId: 100,
			})) : [],
		})) } };
		expect(extractTimeline(raw, match, 100).objectives).toHaveLength(3);
	});

	it('rejects mismatched identities, missing or unordered frames, invalid gold and mismatched matches', () => {
		for (const change of [
			(t: ReturnType<typeof timelineFixture>) => { t.metadata.matchId = 'EUW1_2'; },
			(t: ReturnType<typeof timelineFixture>) => { t.info.participants[0].puuid = 'stranger'; },
			(t: ReturnType<typeof timelineFixture>) => { t.info.participants[0].participantId = 2; },
			(t: ReturnType<typeof timelineFixture>) => { t.info.frames[1].timestamp = 0; },
			(t: ReturnType<typeof timelineFixture>) => { t.info.frames[1].timestamp = 999999999; },
			(t: ReturnType<typeof timelineFixture>) => { t.info.frames[0].participantFrames['1'].totalGold = -1; },
			(t: ReturnType<typeof timelineFixture>) => { delete t.info.frames[0].participantFrames['1']; },
		]) {
			const { match, timeline } = fixture();
			change(timeline);
			expect(() => extractTimeline(timeline, match, 100)).toThrow('Invalid Riot timeline');
		}
	});

	it('rejects corrupt summaries rather than rendering a plausible empty chart', () => {
		expect(() => parseCompactTimeline('{"version":2,"gold":[],"objectives":[]}')).toThrow();
		expect(() => parseCompactTimeline('{"version":1,"gold":[{"at":0,"diff":0},{"at":0,"diff":2}],"objectives":[]}')).toThrow();
	});

	it('retains champion kills, including environmental deaths, in chronological order without player identities', () => {
		const { match, timeline } = fixture();
		const raw = { ...timeline, info: { ...timeline.info, frames: timeline.info.frames.map((frame, i) => ({
			...frame, events: i === 1 ? [
				{ type: 'CHAMPION_KILL', timestamp: 50000, killerId: 0, victimId: 2 },
				{ type: 'CHAMPION_KILL', timestamp: 40000, killerId: 1, victimId: 6 },
				{ type: 'CHAMPION_KILL', timestamp: 45000, killerId: 6, victimId: 1 },
			] : [],
		})) } };
		const compact = extractTimeline(raw, match, 100);
		expect(compact.version).toBe(2);
		expect(compact.kills).toEqual([
			{ at: 40000, killer: match.info.participants[0].championName, victim: match.info.participants[5].championName, ours: true },
			{ at: 45000, killer: match.info.participants[5].championName, victim: match.info.participants[0].championName, ours: false },
			{ at: 50000, killer: null, victim: match.info.participants[1].championName, ours: null },
		]);
		match.info.participants.reverse();
		expect(extractTimeline(raw, match, 200).kills?.map((kill) => kill.ours)).toEqual([false, true, null]);
		expect(parseCompactTimeline(JSON.stringify(compact))).toEqual(compact);
		expect(JSON.stringify(compact)).not.toMatch(/puuid|riotId|position|inventory/);
	});

	it('rejects malformed or out-of-range champion kill events', () => {
		const { match, timeline } = fixture();
		for (const event of [
			{ type: 'CHAMPION_KILL', timestamp: -1, killerId: 1, victimId: 6 },
			{ type: 'CHAMPION_KILL', timestamp: 999999999, killerId: 1, victimId: 6 },
			{ type: 'CHAMPION_KILL', timestamp: 40000, killerId: 11, victimId: 6 },
			{ type: 'CHAMPION_KILL', timestamp: 40000, killerId: 1, victimId: 0 },
		]) {
			const raw = { ...timeline, info: { ...timeline.info, frames: timeline.info.frames.map((frame, i) => ({
				...frame, events: i === 1 ? [event] : [],
			})) } };
			expect(() => extractTimeline(raw, match, 100)).toThrow('Invalid Riot timeline');
		}
	});

	it('distinguishes missing historical kills from an observed empty kill list', () => {
		const { match, timeline } = fixture();
		const compact = extractTimeline(timeline, match, 100);
		expect(compact.kills).toEqual([]);
		const { kills: _kills, ...legacy } = compact;
		expect(parseCompactTimeline(JSON.stringify({ ...legacy, version: 1 })).kills).toBeNull();
		expect(() => parseCompactTimeline(JSON.stringify(legacy))).toThrow('Invalid stored timeline');
		for (const kill of [
			{ at: -1, killer: 'Ahri', victim: 'Jinx', ours: true },
			{ at: 1000, killer: '../secret', victim: 'Jinx', ours: true },
			{ at: 1000, killer: null, victim: 'Jinx', ours: true },
			{ at: 1000, killer: 'Ahri', victim: '', ours: false },
		]) expect(() => parseCompactTimeline(JSON.stringify({ ...compact, kills: [kill] }))).toThrow();
	});
});
