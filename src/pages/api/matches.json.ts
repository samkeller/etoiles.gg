import type { APIRoute } from 'astro';
import { db } from '../../lib/db/db';
import { json, jsonError } from '../../lib/http';
import { getMatches, MATCH_SCOPES, type MatchScope } from '../../lib/stats';

export const GET: APIRoute = ({ url }) => {
	const scope = url.searchParams.get('scope') ?? 'full';
	if (!MATCH_SCOPES.includes(scope as MatchScope)) {
		return jsonError(`Paramètre scope invalide : attendu ${MATCH_SCOPES.join(' ou ')}.`, 400);
	}

	return json({ scope, matches: getMatches(db, scope as MatchScope) });
};
