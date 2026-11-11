import type { DraftOpponentRecord } from './types';

export function sidebarRecords(
	bans: readonly { champion: string; bans: number }[],
	opponents: readonly DraftOpponentRecord[],
	limit = 12,
) {
	const byChampion = new Map(opponents.map((record) => [record.champion, record]));
	const banRecords = bans.slice(0, limit).map(({ champion, bans }) => {
		const record = byChampion.get(champion);
		return { champion, bans, games: record?.games ?? 0, wins: record?.wins ?? 0 };
	});
	const opponentRecords = [...opponents].sort((left, right) => {
		return left.wins * right.games - right.wins * left.games
			|| right.games - left.games || left.champion.localeCompare(right.champion);
	}).slice(0, limit);
	return { banRecords, opponentRecords };
}
