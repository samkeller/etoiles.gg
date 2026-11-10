import type { CompactTimeline, GoldFrame, TimelineKill, TimelineObjective } from './timeline';
import { formatDuration } from './format';

export const CHART = { width: 1000, height: 280, left: 72, right: 24, top: 24, bottom: 40 };
export const plotWidth = CHART.width - CHART.left - CHART.right;
export const plotBottom = CHART.height - CHART.bottom;

export function timelineScale(summary: CompactTimeline) {
	const max = Math.max(1000, ...summary.gold.map((frame) => Math.abs(frame.diff)));
	const magnitude = 10 ** Math.floor(Math.log10(max / 2));
	const step = [1, 2, 2.5, 5, 10].map((n) => n * magnitude).find((n) => n >= max / 2)!;
	const extent = step * 2;
	const end = Math.max(1, summary.gold.at(-1)!.at,
		...summary.objectives.map((event) => event.at), ...(summary.kills?.map((event) => event.at) ?? []));
	const interval = [1, 2, 5, 10, 15, 20, 30, 60, 120].map((minutes) => minutes * 60_000)
		.find((ms) => ms >= end / 6) ?? Math.ceil(end / 6 / 60_000) * 60_000;
	const ticks = [0];
	for (let at = interval; at < end; at += interval) if (end - at > interval / 3) ticks.push(at);
	ticks.push(end);
	return {
		extent, end, ticks,
		yTicks: [-extent, -step, 0, step, extent],
		x: (at: number) => CHART.left + at / end * plotWidth,
		y: (diff: number) => CHART.top + (1 - diff / extent) / 2 * (plotBottom - CHART.top),
	};
}

export type ChartEvent =
	| { type: 'objective'; event: TimelineObjective }
	| { type: 'kill'; event: TimelineKill };

export interface TimelineMarker {
	at: number;
	type: ChartEvent['type'];
	ours: boolean | null;
	label: string;
}

/** Fixed screen-space bins keep even adjacent clusters on one non-overlapping row. */
export function groupTimelineEvents<T extends TimelineMarker>(events: T[], end: number, width: number) {
	const bins = Math.max(1, Math.floor(width / 40));
	const groups = new Map<number, T[]>();
	for (const entry of [...events].sort((a, b) => a.at - b.at)) {
		const bin = Math.min(bins - 1, Math.max(0, Math.floor(entry.at / end * bins)));
		const entries = groups.get(bin) ?? [];
		entries.push(entry);
		groups.set(bin, entries);
	}
	return [...groups].map(([bin, entries]) => ({
		entries,
		percent: (bin + 0.5) / bins * 100,
		from: entries[0].at,
		to: entries.at(-1)!.at,
	}));
}

export function markerTone(entries: TimelineMarker[]) {
	const ours = entries.some((entry) => entry.ours === true);
	const theirs = entries.some((entry) => entry.ours === false);
	return ours && theirs ? 'border-gold-300 border-b-hextech-300 text-ink' :
		ours ? 'border-gold-300/70 text-gold-200' :
			theirs ? 'border-hextech-300/60 text-hextech-300' : 'border-grey-700 text-muted';
}

export function markerTooltipTitle(entries: TimelineMarker[]): string {
	const time = (at: number) => formatDuration(Math.floor(at / 1000));
	return `${time(entries[0].at)}–${time(entries.at(-1)!.at)}`;
}

export function nearestGoldFrame(gold: GoldFrame[], at: number): number {
	return gold.reduce((best, frame, index) =>
		Math.abs(frame.at - at) < Math.abs(gold[best].at - at) ? index : best, 0);
}
