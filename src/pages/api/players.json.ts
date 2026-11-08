import type { APIRoute } from 'astro';
import { db } from '../../lib/db/db';
import { json } from '../../lib/http';
import { getPlayers } from '../../lib/stats';

export const GET: APIRoute = () => json({ players: getPlayers(db) });
