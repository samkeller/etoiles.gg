import { formatPercent, pluralize } from '../../lib/format';
import { winrateEstimate } from '../../lib/stats/winrate';

interface Props {
	wins: number;
	games: number;
}

export default function ObservedWinRate({ wins, games }: Props) {
	const estimate = winrateEstimate(wins, games);
	if (!estimate) return <span class="text-xs text-muted" aria-label="Aucune partie">—</span>;

	return (
		<span class="inline-flex w-full max-w-16 flex-col gap-1.5 align-middle">
			<span class="text-center font-medium tabular-nums text-gold-100" aria-hidden="true">{formatPercent(estimate.rate)}</span>
			<svg viewBox="-3 0 106 10" class="h-2.5 w-full overflow-visible" aria-hidden="true">
				<line x1="0" x2="100" y1="5" y2="5" class="stroke-white/10" stroke-width="1" />
				<line x1={estimate.lower * 100} x2={estimate.upper * 100} y1="5" y2="5"
					class="stroke-gold-200/50" stroke-width="3" stroke-linecap="round" />
				<circle cx={estimate.rate * 100} cy="5" r="2.5" class="fill-gold-100" />
			</svg>
			<span class="sr-only">
				{formatPercent(estimate.rate)} de victoires sur {pluralize(games, 'partie')}.
				Intervalle de Wilson à 95 % : {formatPercent(estimate.lower)} à {formatPercent(estimate.upper)}.
			</span>
		</span>
	);
}
