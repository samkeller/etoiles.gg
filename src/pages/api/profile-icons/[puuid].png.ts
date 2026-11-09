import type { APIRoute } from 'astro';
import { db } from '../../../lib/db/db';
import { getProfileImage, ProfileImageUpstreamError } from '../../../lib/profile-images';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
	try {
		const image = await getProfileImage(db, params.puuid ?? '');
		return image ?? new Response('Profile image not found.', { status: 404 });
	} catch (error) {
		if (error instanceof ProfileImageUpstreamError) {
			return new Response(error.message, {
				status: 502,
				headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
			});
		}
		throw error;
	}
};
