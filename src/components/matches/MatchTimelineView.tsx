import { h, hydrate, render } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { TimelineState } from '../../lib/stats/timelines';
import { OBJECTIVE_LABELS } from '../../lib/timeline';
import {
	CHART,
	plotBottom,
	plotWidth,
	groupTimelineEvents,
	markerTone,
	markerTooltipTitle,
	nearestGoldFrame,
	timelineScale,
	type ChartEvent,
	type TimelineMarker,
} from '../../lib/timelineChart';
import { formatCompact, formatDuration } from '../../lib/format';
import { championIcon, championName } from '../../lib/lol';
import type { OpggIconName } from '../../lib/opgg-icons';

interface Props {
	timeline: TimelineState;
	matchId: string;
}

const icons = {
	dragon: 'objective-dragon',
	baron: 'objective-baronnashor',
	herald: 'objective-riftherald',
	grubs: 'objective-voidgrub',
	tower: 'objective-tower',
	inhibitor: 'objective-inhibitor',
} satisfies Record<keyof typeof OBJECTIVE_LABELS, OpggIconName>;

const signed = (diff: number) => `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${formatCompact(Math.abs(diff))}`;
const time = (at: number) => formatDuration(Math.floor(at / 1000));

function icon(name: OpggIconName, className: string) {
	const src = `/opgg/svg/${name}.svg`;
	return (
		<span
			aria-hidden="true"
			class={`inline-block shrink-0 bg-current ${className}`}
			style={`mask: url("${src}") center / contain no-repeat; -webkit-mask: url("${src}") center / contain no-repeat;`}
		/>
	);
}

function champion(championId: string, className: string) {
	const name = championName(championId);
	return (
		<span class={`relative inline-grid size-6 shrink-0 place-items-center overflow-hidden border border-gold-700 bg-night-800 font-display text-[0.55rem] font-bold text-muted ${className}`}>
			<span aria-hidden="true">{name.slice(0, 2)}</span>
			<img
				src={championIcon(championId)}
				alt={name}
				width="120"
				height="120"
				loading="lazy"
				decoding="async"
				class="absolute inset-0 size-full scale-110 object-cover"
			/>
		</span>
	);
}

function eventIcon(entry: ChartEvent) {
	if (entry.type === 'objective') return icon(icons[entry.event.kind], 'size-5');
	return entry.event.killer
		? champion(entry.event.killer, 'border-0')
		: icon('stat-kills', 'size-5');
}

function describe(entry: ChartEvent) {
	return entry.type === 'objective'
		? OBJECTIVE_LABELS[entry.event.kind]
		: `${entry.event.killer ? championName(entry.event.killer) : 'Environnement'} élimine ${championName(entry.event.victim)}`;
}

function TimelineTooltipRow({ entry }: { entry: ChartEvent }) {
	const { event } = entry;
	const tone = event.ours === true ? 'text-gold-200' : event.ours === false ? 'text-hextech-300' : 'text-muted';
	return (
		<div data-timeline-tip-row data-event-type={entry.type} class="flex items-center gap-2 border-t border-white/10 py-2 first:border-0">
			<time class="w-10 shrink-0 text-muted tabular-nums">{time(event.at)}</time>
			<div class={`flex min-w-0 flex-1 flex-wrap items-center gap-1.5 ${tone}`}>
				{entry.type === 'objective' ? (
					<>
						{icon(icons[entry.event.kind], 'size-5')}
						<span>{OBJECTIVE_LABELS[entry.event.kind]}</span>
					</>
				) : (
					<>
						{entry.event.killer ? champion(entry.event.killer, '') : <span>Environnement</span>}
						{icon('stat-kills', 'size-4')}
						{champion(entry.event.victim, '')}
						<span class="text-ink">
							{entry.event.killer ? championName(entry.event.killer) : 'Environnement'} → {championName(entry.event.victim)}
						</span>
					</>
				)}
			</div>
			<span class={`shrink-0 text-[10px] ${tone}`}>
				{event.ours === true ? 'Étoiles' : event.ours === false ? 'Adversaires' : 'Neutre'}
			</span>
		</div>
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isTimelineState(value: unknown): value is TimelineState {
	if (!isRecord(value)) return false;
	if (value.status === 'pending' || value.status === 'unavailable') return value.summary === null;
	if (value.status !== 'ready' || !isRecord(value.summary)) return false;
	return Array.isArray(value.summary.gold)
		&& Array.isArray(value.summary.objectives)
		&& (value.summary.kills === null || Array.isArray(value.summary.kills))
		&& typeof value.summary.version === 'number';
}

function readProps(root: HTMLElement): Props {
	const serialized = root.dataset.props;
	if (!serialized) throw new Error('Missing match timeline props.');
	const value: unknown = JSON.parse(serialized);
	if (!isRecord(value) || typeof value.matchId !== 'string' || !isTimelineState(value.timeline)) {
		throw new Error('Invalid match timeline props.');
	}
	return { matchId: value.matchId, timeline: value.timeline };
}

const mounted = new WeakSet<HTMLElement>();
const rootSelector = '[data-match-timeline-root]';

function getRoots(root: ParentNode): HTMLElement[] {
	const roots = [...root.querySelectorAll<HTMLElement>(rootSelector)];
	if (root instanceof HTMLElement && root.matches(rootSelector)) roots.unshift(root);
	return roots;
}

export function hydrateMatchTimelines(root: ParentNode) {
	for (const element of getRoots(root)) {
		if (mounted.has(element)) continue;
		hydrate(h(MatchTimelineView, readProps(element)), element);
		mounted.add(element);
	}
}

export function disposeMatchTimelines(root: ParentNode) {
	for (const element of getRoots(root)) {
		if (!mounted.has(element)) continue;
		render(null, element);
		mounted.delete(element);
	}
}

export default function MatchTimelineView({ timeline, matchId }: Props) {
	const summary = timeline.status === 'ready' ? timeline.summary : null;
	const scale = summary && summary.gold.length > 0 ? timelineScale(summary) : null;
	const last = summary?.gold.at(-1);
	const clip = `timeline-${matchId.replace(/[^A-Za-z0-9_-]/g, '-')}`;
	const [selected, setSelected] = useState(() => (summary?.gold.length ?? 1) - 1);
	const [preview, setPreview] = useState<number | null>(null);
	const [showObjectives, setShowObjectives] = useState(true);
	const [showKills, setShowKills] = useState(() => summary?.kills !== null && summary?.kills !== undefined);
	const [trackWidth, setTrackWidth] = useState(plotWidth * 820 / CHART.width);
	const track = useRef<HTMLDivElement>(null);
	const frames = summary?.gold ?? [];
	const visibleIndex = preview ?? selected;
	const current = frames[visibleIndex];

	const markers = useMemo(() => {
		if (!summary) return [];
		const events: ChartEvent[] = [
			...summary.objectives.map((event) => ({ type: 'objective' as const, event })),
			...(summary.kills?.map((event) => ({ type: 'kill' as const, event })) ?? []),
		].sort((a, b) => a.event.at - b.event.at);
		return events.map((entry) => ({
			...entry,
			at: entry.event.at,
			ours: entry.event.ours,
			label: describe(entry),
		})) satisfies (ChartEvent & TimelineMarker)[];
	}, [summary]);

	const groups = useMemo(() => {
		if (!scale) return [];
		const visible = markers.filter((marker) => marker.type === 'objective' ? showObjectives : showKills);
		return groupTimelineEvents(visible, scale.end, trackWidth);
	}, [markers, scale, showObjectives, showKills, trackWidth]);

	useEffect(() => {
		const element = track.current;
		if (!element) return;
		const updateWidth = () => {
			const width = element.getBoundingClientRect().width;
			if (width > 0) setTrackWidth((currentWidth) => currentWidth === width ? currentWidth : width);
		};
		const observer = new ResizeObserver(updateWidth);
		observer.observe(element);
		updateWidth();
		return () => observer.disconnect();
	}, []);

	const indexAt = (chart: SVGSVGElement, clientX: number) => {
		const bounds = chart.getBoundingClientRect();
		if (!bounds.width) return selected;
		const fraction = (clientX - bounds.left) / bounds.width;
		const at = (fraction * CHART.width - CHART.left) / plotWidth * (scale?.end ?? 0);
		return nearestGoldFrame(frames, at);
	};

	const commit = (index: number) => {
		setSelected(index);
		setPreview(null);
	};

	return (
		<section aria-label="Déroulé du match" class="min-w-0 border-t border-white/10 pt-5">
			<h3 class="font-display text-xl text-ink">Le fil de la partie</h3>
			{summary && scale && last && current ? (
				<div class="mt-4 block">
					<div class="flex flex-wrap items-center justify-between gap-3 text-xs">
						<p class="text-muted"><span class="text-gold-200">Étoiles (+)</span> / <span class="text-hextech-300">adversaires (−)</span></p>
						<div class="flex flex-wrap gap-4" aria-label="Événements affichés">
							<label class="flex cursor-pointer items-center gap-2 text-ink">
								<input type="checkbox" checked={showObjectives} onChange={(event) => setShowObjectives(event.currentTarget.checked)} data-filter="objective" class="size-4 accent-gold-200 focus-ring" />
								Objectifs ({summary.objectives.length})
							</label>
							<label class="flex items-center gap-2 text-ink">
								<input type="checkbox" checked={showKills} disabled={summary.kills === null} onChange={(event) => setShowKills(event.currentTarget.checked)} data-filter="kill" class="size-4 accent-gold-200 focus-ring" />
								Kills{summary.kills !== null ? ` (${summary.kills.length})` : summary.version === 1 ? ' · à actualiser' : ' · indisponibles'}
							</label>
						</div>
					</div>
					<div class="mt-4 overflow-x-auto rounded border border-white/10 bg-night-950/60" tabIndex={0} aria-label="Graphique et frise chronologique, défilables horizontalement" data-chart-scroll>
						<div class="min-w-[820px] pb-3">
							<svg
								viewBox={`0 0 ${CHART.width} ${CHART.height}`}
								class="block w-full"
								data-gold-chart
								role="img"
								aria-label="Écart d’or au fil de la partie. Or : avance des Étoiles ; bleu : avance adverse. Navigation précise avec le curseur sous le graphique."
								onPointerMove={(event) => {
									if (event.pointerType === 'mouse') setPreview(indexAt(event.currentTarget, event.clientX));
								}}
								onPointerLeave={() => setPreview(null)}
								onClick={(event) => commit(indexAt(event.currentTarget, event.clientX))}
							>
								<defs>
									<clipPath id={`${clip}-positive`}><rect x={CHART.left} y={CHART.top} width={CHART.width - CHART.left - CHART.right} height={scale.y(0) - CHART.top} /></clipPath>
									<clipPath id={`${clip}-negative`}><rect x={CHART.left} y={scale.y(0)} width={CHART.width - CHART.left - CHART.right} height={plotBottom - scale.y(0)} /></clipPath>
								</defs>
								{scale.yTicks.map((diff) => (
									<g key={`y-${diff}`}>
										<line x1={CHART.left} x2={CHART.width - CHART.right} y1={scale.y(diff)} y2={scale.y(diff)}
											class={diff === 0 ? 'stroke-white/40' : 'stroke-white/10'} strokeDasharray={diff === 0 ? '4 5' : undefined} />
										<text x={CHART.left - 10} y={scale.y(diff) + 4} textAnchor="end" class="fill-muted text-[12px] tabular-nums">{signed(diff)}</text>
									</g>
								))}
								{scale.ticks.map((at) => (
									<g key={`x-${at}`}>
										<line x1={scale.x(at)} x2={scale.x(at)} y1={CHART.top} y2={plotBottom} class="stroke-white/5" />
										<text x={scale.x(at)} y={plotBottom + 24}
											textAnchor={at === 0 ? 'start' : at === scale.end ? 'end' : 'middle'}
											class="fill-muted text-[12px] tabular-nums">{time(at)}</text>
									</g>
								))}
								{(['positive', 'negative'] as const).map((part) => (
									<g key={part} clipPath={`url(#${clip}-${part})`} class={part === 'positive' ? 'text-gold-200' : 'text-hextech-300'}>
										<polygon points={`${scale.x(summary.gold[0].at)},${scale.y(0)} ${summary.gold.map((frame) => `${scale.x(frame.at)},${scale.y(frame.diff)}`).join(' ')} ${scale.x(last.at)},${scale.y(0)}`} fill="currentColor" fillOpacity="0.13" />
										<polyline points={summary.gold.map((frame) => `${scale.x(frame.at)},${scale.y(frame.diff)}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
									</g>
								))}
								{summary.gold.map((frame) => (
									<circle key={frame.at} cx={scale.x(frame.at)} cy={scale.y(frame.diff)} r="3" data-frame data-at={frame.at} data-diff={frame.diff}
										class={frame.diff >= 0 ? 'fill-gold-200' : 'fill-hextech-300'}>
										<title>{time(frame.at)} · {signed(frame.diff)} or</title>
									</circle>
								))}
								<line data-cursor x1={scale.x(current.at)} x2={scale.x(current.at)} y1={CHART.top} y2={plotBottom} class="pointer-events-none stroke-ink/60" strokeDasharray="3 4" />
								<circle data-cursor-point cx={scale.x(current.at)} cy={scale.y(current.diff)} r="5" class="pointer-events-none fill-night-950 stroke-ink" strokeWidth="2" />
							</svg>
							<div class="relative h-12 border-t border-white/10" aria-label="Événements regroupés">
								<div ref={track} data-event-track class="absolute inset-y-0" style={`left:${CHART.left / CHART.width * 100}%;right:${CHART.right / CHART.width * 100}%`}>
									{groups.map((group) => {
										const title = markerTooltipTitle(group.entries);
										return (
											<button
												key={group.from}
												type="button"
												data-event-group
												data-at={group.from}
												data-tip-scroll
												data-tip-title={title}
												data-tip={title}
												aria-label={`${title} · ${group.entries.length} événement${group.entries.length > 1 ? 's' : ''}`}
												class={`focus-ring absolute top-2 grid size-7 -translate-x-1/2 place-items-center rounded border bg-night-900 hover:bg-night-800 ${markerTone(group.entries)}`}
												style={`left:${group.percent}%`}
												onClick={(event) => {
													event.stopPropagation();
													event.currentTarget.focus({ preventScroll: true });
													commit(nearestGoldFrame(frames, group.from));
												}}
											>
												{eventIcon(group.entries[0])}
												{group.entries.length > 1 && <span class="absolute -top-2 -right-2 min-w-4 rounded-full bg-ink px-1 text-[10px] leading-4 font-bold tabular-nums text-night-950">{group.entries.length}</span>}
												<template data-tip-content>
													{group.entries.map((entry) => <TimelineTooltipRow key={`${entry.type}-${entry.at}`} entry={entry} />)}
												</template>
											</button>
										);
									})}
								</div>
							</div>
						</div>
					</div>
					<div class="mt-3 flex items-center gap-3">
						<span data-gold-readout class="w-44 shrink-0 text-xs tabular-nums text-ink">{time(current.at)} · {signed(current.diff)} or</span>
						<input type="range" min="0" max={summary.gold.length - 1} value={visibleIndex} step="1"
							aria-label="Explorer les relevés d’or avec les flèches du clavier"
							aria-valuetext={`${time(current.at)} : ${signed(current.diff)} or`}
							onInput={(event) => commit(Number(event.currentTarget.value))}
							class="focus-ring h-5 min-w-0 flex-1 cursor-pointer accent-gold-200" />
					</div>
				</div>
			) : (
				<p class="mt-2 text-sm text-muted">
					{timeline.status === 'unavailable' ? 'Riot ne fournit pas de timeline pour cette partie.' : 'Timeline en attente de synchronisation.'}
				</p>
			)}
		</section>
	);
}
