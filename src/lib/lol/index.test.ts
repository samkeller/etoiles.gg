import { expect, it } from 'vitest';
import { profileIcon } from './index';

it('uses the dynamic profile image endpoint', () => {
	const puuid = 'A'.repeat(78);
	expect(profileIcon(puuid)).toBe(`/api/profile-icons/${puuid}.png`);
});
