import { afterEach, describe, expect, it } from 'vitest';
import { addMatch, closeTestDatabases, createTestDatabase, fullLineup } from './fixtures';
import { getDiscoveries } from './insights';

afterEach(closeTestDatabases);
describe('sourced and thresholded discoveries', () => {
	it('does not fill an empty page or a small sample', () => {
		const db = createTestDatabase();
		expect(getDiscoveries(db)).toEqual([]);
		for (let i = 0; i < 19; i++) addMatch(db, {
			id: `EUW1_${i}`, startedAt: i, won: i < 10, firstDragon: i < 10 ? 'ours' : 'theirs', members: fullLineup(),
		});
		expect(getDiscoveries(db)).toEqual([]);
	});

	it('requires two groups of 10 and a 15 point difference; sources exclude unknown objectives and non-team matches', () => {
		const db = createTestDatabase();
		for (let i = 0; i < 20; i++) addMatch(db, {
			id: `EUW1_${i}`, startedAt: i, won: i < 10 ? i < 7 : i < 15,
			firstDragon: i < 10 ? 'ours' : 'theirs', members: fullLineup(),
		});
		addMatch(db, { id: 'EUW1_98', startedAt: 98, won: true, members: fullLineup() });
		addMatch(db, { id: 'EUW1_99', startedAt: 99, won: true, firstDragon: 'ours', members: fullLineup().slice(0, 3) });
		const discovery = getDiscoveries(db)[0];
		expect(discovery.text).toBe('7 V / 10 quand nous le prenons, contre 5 V / 10 quand il revient aux adversaires.');
		expect(discovery.matchIds).toHaveLength(20);
		expect(discovery.matchIds).not.toContain('EUW1_98');
		db.exec("UPDATE matches SET raw_json = json_set(raw_json, '$.info.teams[0].objectives.dragon.first', json('false')) WHERE match_id = 'EUW1_0'");
		expect(getDiscoveries(db)).toEqual([]);
	});

	it('does not advertise a tiny rate difference', () => {
		const db = createTestDatabase();
		for (let i = 0; i < 20; i++) addMatch(db, {
			id: `EUW1_${i}`, startedAt: i, won: i < 10 ? i < 6 : i < 15,
			firstDragon: i < 10 ? 'ours' : 'theirs', members: fullLineup(),
		});
		expect(getDiscoveries(db)).toEqual([]);
	});

	it('includes an exact 15 point gap without floating-point boundary errors', () => {
		const db = createTestDatabase();
		for (let i = 0; i < 40; i++) addMatch(db, {
			id: `EUW1_${i}`, startedAt: i, won: i < 20 ? i < 14 : i < 31,
			firstDragon: i < 20 ? 'ours' : 'theirs', members: fullLineup(),
		});
		expect(getDiscoveries(db).find((item) => item.id === 'first-dragon')?.matchIds).toHaveLength(40);
	});

	it('detects an observed new pick and widening pool using distinct consecutive windows with exact sources', () => {
		const db = createTestDatabase();
		for (let i = 0; i < 40; i++) addMatch(db, {
			id: `EUW1_${i}`, startedAt: i, won: true,
			members: fullLineup({ 0: { champion: i < 20 ? 'Aatrox' : i < 30 ? ['Vi', 'Jinx', 'Lux'][i % 3] : 'Ahri' } }),
		});
		const discoveries = getDiscoveries(db);
		expect(discoveries.find((item) => item.id.startsWith('new-pick:'))).toMatchObject({ champion: 'Ahri', puuid: 'player-0' });
		expect(discoveries.find((item) => item.id.startsWith('new-pick:'))?.matchIds).toHaveLength(30);
		expect(discoveries.find((item) => item.id.startsWith('pool:'))?.text).toContain('4 champions différents');
		expect(discoveries.find((item) => item.id.startsWith('pool:'))?.matchIds).toHaveLength(40);
	});
});
