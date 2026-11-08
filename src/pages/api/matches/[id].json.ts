import type { APIRoute } from 'astro';
import { db } from '../../../lib/db/db';
import { json, jsonError } from '../../../lib/http';
import { getMatchDetail, isMatchId } from '../../../lib/stats';

export const GET: APIRoute = ({ params }) => {
	const id = params.id ?? '';
	if (!isMatchId(id)) return jsonError('Identifiant de match invalide.', 400);

	const detail = getMatchDetail(db, id);
	return detail === null ? jsonError('Match introuvable.', 404) : json(detail);
};
