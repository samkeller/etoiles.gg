import { describe, expect, it, vi } from 'vitest';
import { GET } from './[puuid].png';

vi.mock('../../../lib/db/db', () => ({ db: {} }));
vi.mock('../../../lib/profile-images', () => ({
	getProfileImage: vi.fn(async (_database, puuid: string) =>
		puuid === 'A'.repeat(78) ? new Response('png', { headers: { 'content-type': 'image/png' } }) : null),
	ProfileImageUpstreamError: class ProfileImageUpstreamError extends Error {},
}));

describe('profile image endpoint', () => {
	it('serves registered profile images and returns 404 for unknown identities', async () => {
		const known = await GET({ params: { puuid: 'A'.repeat(78) } } as never);
		expect(known.status).toBe(200);
		expect(known.headers.get('content-type')).toBe('image/png');

		const unknown = await GET({ params: { puuid: 'missing' } } as never);
		expect(unknown.status).toBe(404);
	});
});
