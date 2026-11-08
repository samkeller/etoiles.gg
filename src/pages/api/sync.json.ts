import type { APIRoute } from 'astro';
import { db } from '../../lib/db/db';
import { getSyncStatus } from '../../lib/sync-status';
import { json } from '../../lib/http';
import { ingestionEnabled } from '../../lib/schedule';

export const GET: APIRoute = () => {
	const response = json({
		...getSyncStatus(db),
		schedule: ingestionEnabled() ? 'daily-04:00-UTC' : null,
	});
	response.headers.set('Cache-Control', 'no-store');
	return response;
};
