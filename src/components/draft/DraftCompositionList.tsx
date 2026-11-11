import { formatPercent, formatSince, pluralize } from '../../lib/format';
import { championName } from '../../lib/lol';
import { DraftChampionIcon, DraftIcon } from './DraftIcons';
import type { DraftCompositionData, DraftSeatData } from './types';

interface Props {
	compositions: readonly DraftCompositionData[];
	seats: readonly DraftSeatData[];
	picks: readonly (string | null)[];
	minimumGames: number;
	renderedAt: number;
	onLoad: (champions: readonly string[]) => void;
}

const VISIBLE_COMPOSITIONS = 6;

export default function DraftCompositionList({ compositions, seats, picks, minimumGames, renderedAt, onLoad }: Props) {
	const matches = compositions.filter((composition) =>
		picks.every((champion, index) => champion === null || composition.champions[index] === champion),
	);
	const visible = matches.slice(0, VISIBLE_COMPOSITIONS);

	return (
		<section aria-labelledby="compositions-title">
			<div>
				<p class="label-caps text-gold-200">Déjà jouées</p>
				<h2 id="compositions-title" class="mt-1 font-display text-2xl font-medium tracking-tight text-ink">Nos compositions</h2>
			</div>
			{compositions.length === 0 ? (
				<p class="mt-4 text-sm text-muted">Aucune composition complète enregistrée pour l’instant.</p>
			) : (
				<>
					<ul class="mt-5 flex flex-col gap-2">
						{visible.map((composition) => (
							<li key={composition.champions.join('|')}
								class="flex items-center gap-3 border border-white/10 bg-night-900/50 pr-3 transition-colors hover:border-gold-300/40">
								<button type="button" onClick={() => onLoad(composition.champions)}
									class="focus-ring flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 p-2.5 text-left"
									aria-label={`Charger ${composition.champions.map(championName).join(', ')}`}>
									<span class="flex gap-1">
										{composition.champions.map((champion, seat) => (
											<DraftChampionIcon key={seat} champion={champion} size="sm" tip={seats[seat]?.name ?? false} />
										))}
									</span>
									<span class="text-xs tabular-nums text-muted">
										<span class="text-gold-100">{composition.wins} V</span> – {composition.games - composition.wins} D
										{composition.games >= minimumGames && <span class="text-gold-200"> · {formatPercent(composition.wins / composition.games)}</span>}
									</span>
									<span class="text-xs text-muted">{formatSince(composition.lastPlayedAt, renderedAt)}</span>
								</button>
								<a href={`/matches/${encodeURIComponent(composition.latestMatchId)}`}
									class="focus-ring shrink-0 text-xs text-hextech-300 hover:text-ink"
									data-tip={pluralize(composition.games, 'partie')} data-tip-title="Voir la dernière">
									<DraftIcon name="ui-arrow-right" class="size-4" />
								</a>
							</li>
						))}
					</ul>
					{matches.length === 0 && <p class="mt-4 text-sm text-muted">Jamais jouée en entier : à vous d’écrire la première.</p>}
					<p class="mt-3 text-xs text-muted">{pluralize(matches.length, 'composition')}</p>
				</>
			)}
		</section>
	);
}
