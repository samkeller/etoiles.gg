import { describe, expect, it } from 'vitest';
import { CHART, plotBottom, groupTimelineEvents, markerTone, markerTooltipTitle, nearestGoldFrame, timelineScale, type TimelineMarker } from './timelineChart';
import type { CompactTimeline } from './timeline';

const summary: CompactTimeline = {
	version: 2, gold: [{ at: 0, diff: 0 }, { at: 60000, diff: -6000 }, { at: 120000, diff: 12345 }],
	objectives: [], kills: [],
};

describe('timeline chart geometry', () => {
	it('uses symmetric readable gold ticks and fits every observation', () => {
		const scale = timelineScale(summary);
		expect(scale.extent).toBe(20000);
		expect(scale.yTicks).toEqual([-20000, -10000, 0, 10000, 20000]);
		expect(scale.y(0)).toBe((CHART.top + plotBottom) / 2);
		expect(scale.x(0)).toBe(CHART.left);
		expect(scale.x(scale.end)).toBe(CHART.width - CHART.right);
		for (const frame of summary.gold) {
			expect(scale.y(frame.diff)).toBeGreaterThanOrEqual(CHART.top);
			expect(scale.y(frame.diff)).toBeLessThanOrEqual(plotBottom);
		}
	});

	it('keeps events after the last gold sample on the time axis without inventing gold', () => {
		const scale = timelineScale({ ...summary, objectives: [{ at: 130000, kind: 'tower', ours: true }] });
		expect(scale.end).toBe(130000);
		expect(scale.ticks).toEqual([0, 60000, 130000]);
		expect(nearestGoldFrame(summary.gold, 130000)).toBe(2);
	});

	it('keeps zero gold and very short games readable', () => {
		const scale = timelineScale({ ...summary, gold: [{ at: 0, diff: 0 }, { at: 1000, diff: 0 }] });
		expect(scale.extent).toBe(1000);
		expect(scale.ticks).toEqual([0, 1000]);
	});

	it('aggregates simultaneous events across both teams without dropping duplicates', () => {
		const events: TimelineMarker[] = [
			...Array.from({ length: 3 }, (): TimelineMarker => ({ type: 'objective', at: 55000, label: 'Larves', ours: true })),
			{ type: 'kill', at: 56000, label: 'Ahri élimine Jinx', ours: true },
			{ type: 'objective', at: 55000, label: 'Dragon', ours: false },
			{ type: 'kill', at: 55000, label: 'Environnement élimine Jinx', ours: null },
		];
		const groups = groupTimelineEvents(events, 120000, 740);
		expect(groups).toHaveLength(1);
		expect(groups[0].entries).toHaveLength(6);
		expect(groups[0].from).toBe(55000);
		expect(groups[0].to).toBe(56000);
		expect(groups[0].entries.map((entry) => entry.at)).toEqual([55000, 55000, 55000, 55000, 55000, 56000]);
		expect(groupTimelineEvents([], 120000, 740)).toEqual([]);
		expect(markerTooltipTitle(groups[0].entries)).toBe('0:55–0:56');
		expect(groups[0].entries.filter((entry) => entry.label === 'Larves')).toHaveLength(3);
		expect(groups[0].entries.filter((entry) => entry.ours === true)).toHaveLength(4);
		expect(groups[0].entries.at(-1)?.label).toBe('Ahri élimine Jinx');
		expect(markerTone(groups[0].entries)).toContain('border-b-hextech-300');
	});

	it('selects only observed gold samples, including ties and out-of-bounds pointer positions', () => {
		expect(nearestGoldFrame(summary.gold, -1000)).toBe(0);
		expect(nearestGoldFrame(summary.gold, 30000)).toBe(0);
		expect(nearestGoldFrame(summary.gold, 31000)).toBe(1);
		expect(nearestGoldFrame(summary.gold, 999999)).toBe(2);
	});

	it('bounds marker count and separation to one row even for very dense timelines and endpoints', () => {
		const events: TimelineMarker[] = Array.from({ length: 1001 }, (_, index) => ({
			at: index * 120, type: 'objective', label: 'Tour', ours: true,
		}));
		for (const width of [240, 740, 1000]) {
			const groups = groupTimelineEvents(events, 120000, width);
			expect(groups.length).toBeLessThanOrEqual(Math.floor(width / 40));
			expect(groups.flatMap((group) => group.entries)).toEqual(events);
			expect(groups[0].percent / 100 * width).toBeGreaterThanOrEqual(19.99);
			expect((100 - groups.at(-1)!.percent) / 100 * width).toBeGreaterThanOrEqual(19.99);
			for (let index = 1; index < groups.length; index++) {
				expect((groups[index].percent - groups[index - 1].percent) / 100 * width).toBeGreaterThanOrEqual(39.99);
			}
		}
	});

	it('recalculates groups after filtering without leaking hidden events into counts or tooltips', () => {
		const events: TimelineMarker[] = [
			{ at: 55000, type: 'kill', label: 'Ahri élimine Jinx', ours: true },
			{ at: 56000, type: 'objective', label: 'Dragon', ours: false },
		];
		const filtered = events.filter((entry) => entry.type === 'objective');
		const groups = groupTimelineEvents(filtered, 120000, 740);
		expect(groups[0].entries).toHaveLength(1);
		expect(markerTooltipTitle(groups[0].entries)).toBe('0:56–0:56');
		expect(groups[0].entries[0].label).toBe('Dragon');
		expect(markerTone(groups[0].entries)).toContain('text-hextech-300');
		expect(markerTone([events[0]])).toContain('text-gold-200');
		expect(markerTone([{ ...events[0], ours: null }])).toContain('text-muted');
		expect(groupTimelineEvents(events, 120000, 0)).toHaveLength(1);
	});
});
