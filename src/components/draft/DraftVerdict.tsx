import { formatDate, formatPercent, pluralize } from '../../lib/format';
import { championName } from '../../lib/lol';
import { matchesWithPicks, pairRecords } from '../../lib/stats/draft';
import { DraftChampionIcon } from './DraftIcons';
import type { DraftPick } from './types';
import type { DraftMatch } from '../../lib/stats/draft';

const VISIBLE_MATCHES = 24;

interface Props {
	matches: readonly DraftMatch[];
	picks: DraftPick[];
	minimumGames: number;
}

export default function DraftVerdict({ matches, picks, minimumGames }: Props) {
	const record = matchesWithPicks(matches, picks);
	const pairs = pairRecords(matches, picks);
	const seenPairs = pairs.filter((pair) => pair.record.games > 0);
	const unseenPairs = pairs.filter((pair) => pair.record.games === 0);

	return (
		<section aria-labelledby="verdict-title" class="border border-white/10 bg-night-900/60 p-5 sm:p-7">
			<h2 id="verdict-title" class="font-display text-xl font-medium tracking-tight text-ink">Dans nos parties à cinq</h2>
			{picks.length === 0 ? (
				<p class="mt-4 text-sm text-muted">Un pick suffit pour voir son historique ; plusieurs révèlent leurs associations.</p>
			) : (
				<div aria-live="polite" class="mt-5 grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
					<div>
						<p class={`label-caps text-[0.65rem] ${record.games === 0 ? 'text-hextech-300' : 'text-muted'}`}>
							{record.games === 0 ? 'Suggestion exploratoire' : picks.length === 1 ? 'Historique observé' : `Historique observé · ${picks.length} picks réunis`}
						</p>
						<p class="mt-2 flex items-baseline gap-3">
							<span class="font-display text-5xl text-ink tabular-nums">{record.games}</span>
							<span class="text-sm tabular-nums text-muted">
								{record.games === 0
									? picks.length === 1 ? 'partie à cinq' : 'partie à cinq avec ces picks réunis'
									: `${pluralize(record.games, 'partie')} · ${record.wins} V – ${record.games - record.wins} D`}
							</span>
						</p>
						<p class={`mt-1 text-sm ${record.games >= minimumGames ? 'text-gold-200' : 'text-muted'}`}>
							{record.games >= minimumGames
								? `${formatPercent(record.wins / record.games)} de victoires`
								: record.games > 0 ? `Taux affiché à partir de ${minimumGames} parties` : 'Jamais réunis : tout reste à découvrir.'}
						</p>
						{record.matches.length > 0 && (
							<>
								<p class="mt-4 text-xs text-muted">Parties contenant tous les picks sélectionnés, pour ces joueurs :</p>
								<ol aria-label="Parties contenant tous les picks sélectionnés" class="mt-2 flex flex-wrap gap-1.5">
									{record.matches.slice(0, VISIBLE_MATCHES).map((match, position) => (
										<li key={match.id}>
											<a href={`/matches/${encodeURIComponent(match.id)}`}
												class={`focus-ring block size-3.5 rotate-45 border transition-transform hover:scale-125 motion-safe:animate-pop ${match.outcome === 'win' ? 'border-gold-100 bg-gold-200' : 'border-grey-700 bg-night-800'}`}
												style={{ animationDelay: `${Math.min(position, 12) * 30}ms` }}
												data-tip-title={match.outcome === 'win' ? 'Victoire' : 'Défaite'}
												data-tip={formatDate(match.startedAt)}
												aria-label={`${match.outcome === 'win' ? 'Victoire' : 'Défaite'} du ${formatDate(match.startedAt)}`} />
										</li>
									))}
								</ol>
							</>
						)}
					</div>
					{pairs.length > 0 && (
						<div>
							<p class="label-caps text-[0.65rem] text-muted">Paires déjà jouées</p>
							{seenPairs.length > 0 && (
								<ul class="mt-3 flex flex-col gap-2">
									{seenPairs.map((pair) => (
										<li key={pair.picks.map((pick) => `${pick.puuid}-${pick.champion}`).join('|')}
											class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3"
											aria-label={`${championName(pair.picks[0].champion)} et ${championName(pair.picks[1].champion)} : ${pair.record.wins} victoires sur ${pair.record.games} parties`}>
											<span aria-hidden="true" class="flex -space-x-1.5">
												{pair.picks.map((pick) => <DraftChampionIcon key={pick.puuid} champion={pick.champion} size="sm" tip={false} class="size-7" />)}
											</span>
											<span aria-hidden="true" class="flex h-1.5 overflow-hidden bg-night-800">
												<span class="origin-left bg-gold-200 motion-safe:animate-grow-x" style={{ width: `${pair.record.wins / pair.record.games * 100}%` }} />
											</span>
											<span aria-hidden="true" class="text-xs tabular-nums text-muted">{pair.record.wins}/{pair.record.games}</span>
										</li>
									))}
								</ul>
							)}
							{unseenPairs.length > 0 && (
								<p class="mt-3 text-xs leading-relaxed text-hextech-300">
									Jamais ensemble : {unseenPairs.map((pair) => pair.picks.map((pick) => championName(pick.champion)).join(' + ')).join(', ')}.
								</p>
							)}
						</div>
					)}
				</div>
			)}
		</section>
	);
}
