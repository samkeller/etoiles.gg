import { useEffect, useMemo, useState } from 'preact/hooks';
import DraftCompositionList from './DraftCompositionList';
import DraftSeat from './DraftSeat';
import DraftSidebar from './DraftSidebar';
import DraftVerdict from './DraftVerdict';
import { DraftIcon } from './DraftIcons';
import type { DraftAppData, DraftPick } from './types';

const toolButton = 'focus-ring inline-flex min-h-9 items-center gap-2 border border-white/12 px-3 text-xs text-muted transition-colors hover:border-gold-200/50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40';

function normalize(value: string) {
	return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export default function DraftApp(data: DraftAppData) {
	const [picks, setPicks] = useState<(string | null)[]>(() => [...data.initialPicks]);
	const [copyMessage, setCopyMessage] = useState('Copier le lien');
	const selection = useMemo<DraftPick[]>(() => picks.flatMap((champion, index) =>
		champion ? [{ puuid: data.seats[index].puuid, champion }] : [],
	), [picks, data.seats]);
	const lookup = useMemo(() => {
		const values = new Map<string, string>();
		for (const entry of data.champions) {
			values.set(normalize(entry.name), entry.id);
			values.set(normalize(entry.id), entry.id);
		}
		return values;
	}, [data.champions]);

	useEffect(() => {
		const url = new URL(window.location.href);
		if (selection.length > 0) url.searchParams.set('picks', picks.map((champion) => champion ?? '').join(','));
		else url.searchParams.delete('picks');
		window.history.replaceState(window.history.state, '', url);
	}, [picks, selection.length]);

	useEffect(() => {
		for (const button of document.querySelectorAll<HTMLElement>('[data-pick-champion]')) {
			if (document.activeElement === button || button.matches(':hover')) {
				button.dispatchEvent(new Event('tooltiprefresh', { bubbles: true }));
			}
		}
	}, [selection]);

	const updateSeat = (index: number, champion: string | null) => {
		setPicks((current) => current.map((value, seat) => seat === index ? champion : value));
	};

	const handleChampionInput = (index: number, input: HTMLInputElement) => {
		const champion = lookup.get(normalize(input.value)) ?? null;
		input.setAttribute('aria-invalid', String(input.value !== '' && champion === null));
		if (!champion) return;
		updateSeat(index, champion);
		input.value = '';
	};

	const copyLink = async () => {
		try {
			await navigator.clipboard.writeText(window.location.href);
			setCopyMessage('Lien copié');
		} catch {
			setCopyMessage('Copie impossible');
		}
		window.setTimeout(() => setCopyMessage('Copier le lien'), 2000);
	};

	const loadComposition = (champions: readonly string[]) => {
		setPicks(data.seats.map((_, index) => champions[index] ?? null));
		document.querySelector('[data-seat="0"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	};

	return (
		<>
			<header class="flex flex-wrap items-end justify-between gap-4">
				<div>
					<p class="label-caps flex items-center gap-3 text-gold-200">
						<span class="size-1.5 rotate-45 bg-gold-200" aria-hidden="true" />
						Draft
					</p>
					<h1 class="mt-2 font-display text-4xl font-medium tracking-tight text-ink sm:text-5xl">Préparer une composition</h1>
				</div>
				<div class="flex gap-2">
					<button type="button" disabled={selection.length === 0} onClick={copyLink} class={toolButton}>
						<DraftIcon name="ui-copy" class="size-3.5" />
						<span aria-live="polite">{copyMessage}</span>
					</button>
					<button type="button" disabled={selection.length === 0} onClick={() => setPicks(data.seats.map(() => null))} class={toolButton}>
						<DraftIcon name="ui-reset" class="size-3.5" /> Tout effacer
					</button>
				</div>
			</header>

			{data.seats.length === 0 ? (
				<p class="border border-white/10 bg-night-900/60 p-8 text-center text-sm text-muted">
					Aucune partie à cinq enregistrée : la table de draft s’ouvrira avec la première soirée.
				</p>
			) : (
				<div class="flex flex-col gap-4">
					<section aria-label="Les cinq sièges" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
						{data.seats.map((seat, index) => (
							<DraftSeat
								key={seat.puuid}
								index={index}
								seat={seat}
								champion={picks[index]}
								selection={selection}
								data={{ matches: data.matches, minimumGames: data.minimumGames, onChampionInput: handleChampionInput }}
								onPick={(champion) => updateSeat(index, picks[index] === champion ? null : champion)}
								onClear={() => updateSeat(index, null)}
							/>
						))}
					</section>
				</div>
			)}

			<div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
				<div class="flex min-w-0 flex-col gap-6">
					<DraftVerdict matches={data.matches} picks={selection} minimumGames={data.minimumGames} />
					<DraftCompositionList
						compositions={data.compositions}
						seats={data.seats}
						picks={picks}
						minimumGames={data.minimumGames}
						renderedAt={data.renderedAt}
						onLoad={loadComposition}
					/>
				</div>
				<DraftSidebar banRecords={data.banRecords} opponentRecords={data.opponentRecords} />
			</div>

			<datalist id="champion-catalog">
				{data.champions.map((champion) => <option key={champion.id} value={champion.name} />)}
			</datalist>
		</>
	);
}
