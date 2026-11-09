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
});
