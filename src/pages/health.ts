import type { APIRoute } from 'astro';
import { db } from '../lib/db/db';
import { healthResponse } from '../lib/health';

export const GET: APIRoute = () => healthResponse(db);
