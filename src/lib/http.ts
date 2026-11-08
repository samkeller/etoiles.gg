const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

export function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

export function jsonError(message: string, status: number): Response {
	return json({ error: message }, status);
}
