import { pluralize } from '../../lib/format';
import { championName } from '../../lib/lol';
import ObservedWinRate from '../ui/ObservedWinRate';
import { DraftChampionIcon } from './DraftIcons';
import type { DraftBanRecord, DraftOpponentRecord } from './types';

interface MatchupPanelProps {
	id: string;
	title: string;
	records: readonly (DraftOpponentRecord | DraftBanRecord)[];
	emptyMessage: string;
}

function MatchupPanel({ id, title, records, emptyMessage }: MatchupPanelProps) {
	return (
		<section aria-labelledby={id} class="border border-white/10 bg-night-900/60 p-5">
			<h2 id={id} class="font-display text-xl font-medium tracking-tight text-ink">{title}</h2>
			{records.length === 0 ? <p class="mt-3 text-sm text-muted">{emptyMessage}</p> : (
				<ul aria-label="Notre winrate contre chaque champion en Flex à cinq"
					class="mt-4 grid grid-cols-4 gap-x-2 gap-y-5">
					{records.map((record) => (
						<li key={record.champion} class="flex min-w-0 flex-col items-center gap-1.5 text-center">
							<span aria-hidden="true"><DraftChampionIcon champion={record.champion} size="md" tip={false} /></span>
							<span class="w-full truncate text-[0.65rem] text-ink">{championName(record.champion)}</span>
							{'bans' in record && (
								<span class="text-[0.6rem] tabular-nums text-muted">{pluralize(record.bans, 'ban')}</span>
							)}
							<ObservedWinRate wins={record.wins} games={record.games} />
							<span class="mt-auto text-[0.6rem] tabular-nums text-muted"
								aria-label={record.games === 0 ? 'Jamais affronté' : pluralize(record.games, 'partie')}>
								{record.games} p.
							</span>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

interface Props {
	banRecords: readonly DraftBanRecord[];
	opponentRecords: readonly DraftOpponentRecord[];
}

export default function DraftSidebar({ banRecords, opponentRecords }: Props) {
	return (
		<aside class="xl:sticky xl:top-24">
			<MatchupPanel id="bans-title" title="Nos bans habituels" records={banRecords}
				emptyMessage="Aucune phase de bans enregistrée." />
			<div class="mt-6">
				<MatchupPanel id="opponents-title" title="Nos plus faibles winrates" records={opponentRecords}
					emptyMessage="Aucun adversaire rencontré à cinq." />
			</div>
			<p class="mt-3 text-xs text-muted">À cinq · trait large = forte incertitude</p>
			<details class="mt-2 text-xs text-muted">
				<summary class="focus-ring cursor-pointer hover:text-ink">Lire les winrates</summary>
				<div class="mt-2 space-y-2 leading-relaxed">
					<p>Point : taux observé. Trait : incertitude. Plus il est large, moins le taux est précis.</p>
					<p>Intervalle de Wilson à 95 %, calculé dès une rencontre. Il ne couvre ni les changements de patch ni ceux de composition.</p>
					<p>Bans habituels : tri par fréquence de ban. Adversaires : tri par winrate croissant, pas une recommandation de ban.</p>
				</div>
			</details>
		</aside>
	);
}
