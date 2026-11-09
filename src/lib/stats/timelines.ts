import type Database from 'better-sqlite3';
import { parseCompactTimeline, type CompactTimeline } from '../timeline';

export type TimelineState =
	| { status: 'ready'; summary: CompactTimeline }
	| { status: 'pending' | 'unavailable'; summary: null };

export function getMatchTimeline(database: Database.Database, matchId: string): TimelineState {
	const row = database.prepare('SELECT status, summary_json AS json FROM match_timelines WHERE match_id = ?')
		.get(matchId) as { status: 'pending' | 'ready' | 'unavailable'; json: string | null } | undefined;
	if (!row) return { status: 'pending', summary: null };
	if (row.status !== 'ready') return { status: row.status, summary: null };
	if (row.json === null) throw new Error(`Missing timeline summary for ${matchId}.`);
	return { status: 'ready', summary: parseCompactTimeline(row.json) };
}
