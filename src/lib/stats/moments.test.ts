import { afterEach, describe, expect, it } from 'vitest';
import { addMatch, closeTestDatabases, createTestDatabase, fullLineup } from './fixtures';
import { getTeamStories, buildTeamStories } from './moments';
import { getTeamFacts } from './facts';
import { getMatchTimeline } from './timelines';

afterEach(closeTestDatabases);
describe('positive team stories', () => {
	it('has no synthetic stories for an empty database', () => {
		expect(getTeamStories(createTestDatabase())).toEqual({ games: 0, multikillCoverage: 0, timelineCoverage: 0, records: [], events: [], recent: [] });
	});

	it('excludes solo/partial matches and early surrenders from time records, preserving missing multikills', () => {
		const db = createTestDatabase();
		for (const match of [
			{ id: 'EUW1_1', durationS: 1800, members: fullLineup() },
			{ id: 'EUW1_2', durationS: 100, members: fullLineup() },
			{ id: 'EUW1_3', durationS: 800, members: fullLineup({ 0: { earlySurrender: true } }) },
			{ id: 'EUW1_4', durationS: 700, members: fullLineup().slice(0, 4) },
			{ id: 'EUW1_5', durationS: 650, members: fullLineup(), queueId: 420 as const },
		]) addMatch(db, { startedAt: Number(match.id.split('_')[1]), won: true, ...match });
		const stories = getTeamStories(db);
		expect(stories.games).toBe(3);
		expect(stories.multikillCoverage).toBe(0);
		expect(stories.records.find((event) => event.kind === 'fastest')?.matchIds).toEqual(['EUW1_1']);
		expect(stories.events.some((event) => event.kind === 'penta')).toBe(false);
	});

	it('finds streaks separated by a loss, perfect nights, positive multikills and stable tie breaking', () => {
		const db = createTestDatabase();
		for (let i = 0; i < 7; i++) addMatch(db, {
			id: `EUW1_${i}`, startedAt: Date.UTC(2026, 0, 1 + Math.floor(i / 3), 20) + (i % 3) * 2_000_000,
			won: i !== 3, durationS: 1500,
			members: fullLineup({ 0: { pentaKills: i === 6 ? 1 : 0, quadraKills: 0, kills: i === 6 ? 20 : 2 } }),
		});
		const stories = getTeamStories(db);
		expect(stories.records.find((event) => event.kind === 'streak')?.matchIds).toEqual(['EUW1_4', 'EUW1_5', 'EUW1_6']);
		expect(stories.events.filter((event) => event.kind === 'streak')).toHaveLength(2);
		expect(stories.events.find((event) => event.kind === 'night')?.value).toBe('3 V · 0 D');
		expect(stories.events.find((event) => event.kind === 'penta')).toMatchObject({ puuid: 'player-0', matchIds: ['EUW1_6'] });
		expect(stories.recent[0].kind).toBe('penta');
		expect(stories.records.find((event) => event.kind === 'fastest')?.matchIds).toEqual(['EUW1_6']);
		expect(stories.recent.length).toBeLessThanOrEqual(3);
	});

	it('recalculates records within the selected period rather than leaking all-time records', () => {
		const db = createTestDatabase();
		addMatch(db, { id: 'EUW1_1', startedAt: 1, durationS: 900, won: true, members: fullLineup() });
		addMatch(db, { id: 'EUW1_2', startedAt: 2, durationS: 1800, won: true, members: fullLineup() });
		expect(buildTeamStories(getTeamFacts(db).filter((fact) => fact.match.id === 'EUW1_2')).records[0].value).toBe('30:00');
	});

	it('requires at least 5000 observed gold deficit for a winning comeback and never infers it without a timeline', () => {
		const db = createTestDatabase();
		for (let i = 0; i < 4; i++) {
			addMatch(db, { id: `EUW1_${i}`, startedAt: i, won: i !== 2, members: fullLineup() });
			if (i === 3) continue;
			const summary = { version: 1, gold: [{ at: 0, diff: 0 }, { at: 60000, diff: i === 0 ? -4999 : -5000 }], objectives: [] };
			db.prepare("INSERT INTO match_timelines (match_id, status, summary_json, updated_at) VALUES (?, 'ready', ?, 0)")
				.run(`EUW1_${i}`, JSON.stringify(summary));
		}
		expect(getTeamStories(db).events.filter((event) => event.kind === 'comeback').map((event) => event.matchIds))
			.toEqual([['EUW1_1']]);
		expect(getMatchTimeline(db, 'EUW1_3')).toEqual({ status: 'pending', summary: null });
	});
});
