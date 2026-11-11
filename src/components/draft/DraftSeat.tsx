import { useState } from 'preact/hooks';
import { formatPercent, recordTip, pluralize } from '../../lib/format';
import { championName, profileIcon, roleIcon, roleLabel } from '../../lib/lol';
import { DraftIcon, DraftChampionIcon } from './DraftIcons';
import type { DraftPick, DraftSeatData } from './types';
import type { DraftMatch } from '../../lib/stats/draft';
import { pickSynergy } from '../../lib/stats/draft';

const VISIBLE_CHAMPIONS = 8;
const pickButton = 'focus-ring group relative grid place-items-center outline-offset-2 transition-transform duration-200 hover:-translate-y-0.5 aria-pressed:-translate-y-0.5 motion-reduce:transition-none';

interface Props {
	index: number;
	seat: DraftSeatData;
	champion: string | null;
	selection: DraftPick[];
	data: {
		matches: readonly DraftMatch[];
		minimumGames: number;
		onChampionInput: (index: number, input: HTMLInputElement) => void;
	};
	onPick: (champion: string) => void;
	onClear: () => void;
}

export default function DraftSeat({ index, seat, champion, selection, data, onPick, onClear }: Props) {
	const [expanded, setExpanded] = useState(false);
	const selectedTeamPick = seat.pool.find((record) => record.champion === champion);
	const selectedExplorePick = seat.explore.find((record) => record.champion === champion);
	const selectedRecord = selectedTeamPick
		? `${pluralize(selectedTeamPick.games, 'partie')} à cinq · ${selectedTeamPick.wins} V – ${selectedTeamPick.games - selectedTeamPick.wins} D${selectedTeamPick.games >= data.minimumGames ? ` · ${formatPercent(selectedTeamPick.wins / selectedTeamPick.games)}` : ''}`
		: selectedExplorePick
			? `Piste perso · ${pluralize(selectedExplorePick.games, 'partie')} en classé`
			: 'Jamais joué à cinq';

	const renderPick = (record: { champion: string; games: number; wins: number }, exploratory: boolean, position: number) => {
		const synergy = pickSynergy(data.matches, selection, {
			puuid: seat.puuid,
			champion: record.champion,
		}, data.minimumGames);
		const direction = synergy?.direction ?? null;
		const canCompare = synergy?.delta !== null && synergy !== null;
		const tip = exploratory
			? `Piste exploratoire · jamais joué à cinq\nEn classé perso : ${recordTip(record, data.minimumGames)}`
			: `À cinq\n${recordTip(record, data.minimumGames)}`;
		const synergyLabel = canCompare
			? `Winrate : ${Math.round(synergy.baseline.wins / synergy.baseline.games * 100)} % sur ${synergy.baseline.games} parties, ${Math.round(synergy.together.wins / synergy.together.games * 100)} % avec la sélection sur ${synergy.together.games} parties.${direction === 'up' ? ' En hausse.' : direction === 'down' ? ' En baisse.' : ''}`
			: '';
		return (
			<li key={`${exploratory ? 'explore' : 'pool'}-${record.champion}`} hidden={!expanded && !exploratory && position >= VISIBLE_CHAMPIONS}>
				<button type="button" class={pickButton} aria-pressed={champion === record.champion}
					aria-label={`${championName(record.champion)}, ${exploratory ? 'piste exploratoire' : `${record.games} parties à cinq`}${synergyLabel ? ` ; ${synergyLabel}` : ''}`}
					onClick={() => onPick(record.champion)}
					data-pick-seat={index} data-pick-champion={record.champion}
					data-tip-title={championName(record.champion)}
					data-tip={canCompare ? '' : tip}
					data-tip-compact={canCompare ? '' : undefined}>
					<DraftChampionIcon champion={record.champion} size="md"
						class={['group-aria-pressed:border-gold-100 group-aria-pressed:shadow-glow-gold',
							exploratory && 'border-dashed border-hextech-300/50 opacity-75 group-hover:opacity-100 group-aria-pressed:border-hextech-300 group-aria-pressed:opacity-100'].filter(Boolean).join(' ')}
						tip={false} />
					{direction && (
						<span key={direction} aria-hidden="true"
							class={['pointer-events-none absolute -top-1 -right-1 grid size-4 place-items-center border border-current bg-night-950 motion-safe:animate-pop',
								direction === 'up' ? 'text-win' : 'text-loss'].join(' ')}>
							<DraftIcon name="ui-arrow-down" class={`size-3 ${direction === 'up' ? 'rotate-180' : ''}`} />
						</span>
					)}
					{!exploratory && <span aria-hidden="true" class="absolute -right-1 -bottom-1 min-w-4 border border-gold-300/60 bg-night-950 px-0.5 text-center text-[0.6rem] leading-3.5 font-bold tabular-nums text-gold-100">{record.games}</span>}
					<template data-tip-content={canCompare ? '' : undefined}>
						{canCompare && (
							<div class="flex items-center justify-center gap-3 text-center">
								<span class="flex flex-col items-center">
									<span class="font-display text-xl tabular-nums text-ink">{Math.round(synergy.baseline.wins / synergy.baseline.games * 100)} %</span>
									<span class="text-[0.6rem] tabular-nums text-muted">{synergy.baseline.games} parties</span>
								</span>
								<span aria-hidden="true" class="pb-3 text-muted">→</span>
								<span class="flex flex-col items-center">
									<span class="font-display text-xl tabular-nums text-ink">{Math.round(synergy.together.wins / synergy.together.games * 100)} %</span>
									<span class="text-[0.6rem] text-muted">Sélection</span>
									<span class="text-[0.6rem] tabular-nums text-muted">{synergy.together.games} parties</span>
								</span>
							</div>
						)}
					</template>
				</button>
			</li>
		);
	};

	const hiddenCount = Math.max(0, seat.pool.length - VISIBLE_CHAMPIONS);

	return (
		<article data-seat={index} data-filled={champion !== null ? '' : undefined} aria-labelledby={`seat-${index}-name`}
			class="flex min-w-0 flex-col border border-white/10 bg-night-900/60 transition-colors duration-300 data-filled:border-gold-300/50">
			<header class="flex items-center gap-3 border-b border-white/10 px-3 py-2.5">
				<span aria-hidden="true" class="inline-block size-6 shrink-0 bg-current text-muted"
					style={`mask: url("/opgg/svg/${roleIcon(seat.role)}.svg") center / contain no-repeat; -webkit-mask: url("/opgg/svg/${roleIcon(seat.role)}.svg") center / contain no-repeat;`} />
				<div class="min-w-0 flex-1 leading-tight">
					<p class="label-caps text-[0.6rem] text-gold-200">{roleLabel(seat.role)}</p>
					<a id={`seat-${index}-name`} href={`/players/${seat.puuid}`} class="focus-ring block truncate text-sm text-ink hover:text-gold-100">{seat.name}</a>
				</div>
				<span class="relative inline-grid size-8 shrink-0 place-items-center" aria-hidden="true">
					<span class="absolute inset-0 rounded-full bg-linear-to-b from-gold-100 via-gold-300 to-gold-500 p-0.5">
						<span class="block size-full rounded-full bg-night-950" />
					</span>
					<img src={profileIcon(seat.puuid)} alt="" width="96" height="96" class="relative size-[86%] rounded-full object-cover" />
					<span class="absolute -bottom-1 size-2.5 rotate-45 border border-gold-200 bg-night-950" />
				</span>
			</header>

			<div class="relative grid min-h-36 place-items-center px-3 py-4">
				{champion === null ? (
					<div class="flex flex-col items-center gap-2 text-center">
						<span class="grid size-20 place-items-center border border-dashed border-gold-500/70 bg-night-950/60">
							<DraftIcon name="star" class="size-6 animate-twinkle text-gold-300 motion-reduce:animate-none" />
						</span>
					</div>
				) : (
					<div aria-live="polite" class="flex flex-col items-center gap-1.5 text-center">
						<DraftChampionIcon champion={champion} size="xl" class="border-gold-200 shadow-glow-gold" tip={false} />
						<span class="mt-1 font-display text-sm text-ink">{championName(champion)}</span>
						<span class={`text-xs tabular-nums ${selectedTeamPick ? 'text-muted' : 'text-hextech-300'}`}>{selectedRecord}</span>
					</div>
				)}
				{champion !== null && (
					<button type="button" onClick={onClear} aria-label={`Retirer le pick de ${seat.name}`}
						class="focus-ring absolute top-2 right-2 grid size-7 place-items-center border border-white/10 text-muted transition-colors hover:border-white/30 hover:text-ink">
						<DraftIcon name="ui-close" class="size-3.5" />
					</button>
				)}
			</div>

			<div class="flex flex-1 flex-col gap-4 border-t border-white/10 p-3">
				<div>
					<p class="label-caps mb-2 text-[0.6rem] text-muted">À cinq · {seat.pool.length}</p>
					{seat.pool.length === 0 ? <p class="text-xs text-muted">Aucun pick à cinq.</p> : (
						<>
							<ul class="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-x-2 gap-y-3">
								{seat.pool.map((record, position) => renderPick(record, false, position))}
							</ul>
							{hiddenCount > 0 && !expanded && (
								<button type="button" onClick={() => setExpanded(true)} aria-expanded="false"
									class="focus-ring mt-2 text-xs text-hextech-300 underline decoration-hextech-300/30 underline-offset-4 hover:decoration-hextech-300">
									+ {hiddenCount} {hiddenCount === 1 ? 'autre' : 'autres'}
								</button>
							)}
						</>
					)}
				</div>

				{seat.explore.length > 0 && (
					<div>
						<p class="label-caps mb-2 inline-flex items-center gap-1.5 text-[0.6rem] text-hextech-300"
							data-tip-title="Pistes perso" data-tip="Joués en classé sans le groupe complet, jamais à cinq. Une idée à tester, pas une recommandation.">
							Pistes perso <DraftIcon name="star" class="size-3 text-hextech-300" />
						</p>
						<ul class="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-x-2 gap-y-3">
							{seat.explore.map((record, position) => renderPick(record, true, position))}
						</ul>
					</div>
				)}

				<label class="mt-auto block">
					<span class="sr-only">Autre champion pour {seat.name}</span>
					<span class="relative block">
						<DraftIcon name="search" class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" />
						<input data-seat-input={index} list="champion-catalog" autocomplete="off" placeholder="Autre champion…"
							onChange={(event) => data.onChampionInput(index, event.currentTarget)}
							class="focus-ring h-9 w-full border border-white/12 bg-night-950/70 pr-2.5 pl-8 text-sm text-ink placeholder:text-grey-700 focus:border-hextech-300/60 aria-invalid:border-loss" />
					</span>
				</label>
			</div>
		</article>
	);
}
