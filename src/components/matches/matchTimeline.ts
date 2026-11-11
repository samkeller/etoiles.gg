import { CHART, plotWidth, nearestGoldFrame, groupTimelineEvents, markerTone, markerTooltipTitle, type TimelineMarker } from '../../lib/timelineChart';
import { formatCompact, formatDuration } from '../../lib/format';

class MatchTimeline extends HTMLElement {
	private controller?: AbortController;
	private observer?: ResizeObserver;

	connectedCallback() {
		this.controller?.abort();
		this.observer?.disconnect();
		this.controller = new AbortController();
		const { signal } = this.controller;
		const chart = this.querySelector<SVGSVGElement>('[data-gold-chart]');
		const cursor = this.querySelector<SVGLineElement>('[data-cursor]');
		const point = this.querySelector<SVGCircleElement>('[data-cursor-point]');
		const range = this.querySelector<HTMLInputElement>('[data-gold-range]');
		const readout = this.querySelector<HTMLElement>('[data-gold-readout]');
		const track = this.querySelector<HTMLElement>('[data-event-track]');
		const frames = [...this.querySelectorAll<SVGCircleElement>('[data-frame]')];
		const gold = frames.map((frame) => ({ at: Number(frame.dataset.at), diff: Number(frame.dataset.diff) }));
		if (!chart || !cursor || !point || !range || !readout || !track || !gold.length) {
			throw new Error('Incomplete match timeline markup.');
		}
		const end = Number(this.dataset.end);
		let selected = gold.length - 1;
		const markers = [...this.querySelectorAll<HTMLTemplateElement>('[data-marker]')].map((template) => {
			const { at, type, ours, label } = template.dataset;
			if ((type !== 'objective' && type !== 'kill') || !label || at === undefined ||
				!Number.isFinite(Number(at)) || !['true', 'false', 'null'].includes(ours ?? '')) {
				throw new Error('Invalid match timeline marker.');
			}
			return {
				at: Number(at), type, ours: ours === 'true' ? true : ours === 'false' ? false : null, label, template,
			} satisfies TimelineMarker & { template: HTMLTemplateElement };
		});
		const show = (index: number) => {
			const frame = frames[index];
			const sample = gold[index];
			const value = `${formatDuration(Math.floor(sample.at / 1000))} · ${sample.diff > 0 ? '+' : sample.diff < 0 ? '−' : ''}${formatCompact(Math.abs(sample.diff))} or`;
			readout.textContent = value;
			range.value = String(index);
			range.setAttribute('aria-valuetext', value);
			cursor.setAttribute('x1', frame.getAttribute('cx')!);
			cursor.setAttribute('x2', frame.getAttribute('cx')!);
			point.setAttribute('cx', frame.getAttribute('cx')!);
			point.setAttribute('cy', frame.getAttribute('cy')!);
		};
		const indexAt = (event: PointerEvent | MouseEvent) => {
			const bounds = chart.getBoundingClientRect();
			const fraction = (event.clientX - bounds.left) / bounds.width;
			const at = (fraction * CHART.width - CHART.left) / plotWidth * end;
			return nearestGoldFrame(gold, at);
		};
		chart.addEventListener('pointermove', (event) => {
			if (event.pointerType === 'mouse') show(indexAt(event));
		}, { signal });
		chart.addEventListener('pointerleave', () => show(selected), { signal });
		chart.addEventListener('click', (event) => {
			selected = indexAt(event);
			show(selected);
		}, { signal });
		range.addEventListener('input', () => {
			selected = Number(range.value);
			show(selected);
		}, { signal });
		const filters = [...this.querySelectorAll<HTMLInputElement>('[data-filter]')];
		const renderGroups = () => {
			// A dialog may initially be hidden; regroup again once its actual width is known.
			const width = track.getBoundingClientRect().width;
			if (!width) return;
			const enabled = new Set(filters.filter((filter) => filter.checked).map((filter) => filter.dataset.filter));
			const groups = groupTimelineEvents(markers.filter((marker) => enabled.has(marker.type)), end, width);
			track.replaceChildren(...groups.map((group) => {
				const button = document.createElement('button');
				const title = markerTooltipTitle(group.entries);
				button.type = 'button';
				button.dataset.eventGroup = '';
				button.dataset.at = String(group.from);
				button.dataset.tipScroll = '';
				button.dataset.tipTitle = title;
				button.dataset.tip = title;
				button.setAttribute('aria-label', `${title} · ${group.entries.length} événement${group.entries.length > 1 ? 's' : ''}`);
				button.className = `focus-ring absolute top-2 grid size-7 -translate-x-1/2 place-items-center rounded border bg-night-900 hover:bg-night-800 ${markerTone(group.entries)}`;
				button.style.left = `${group.percent}%`;
				const content = document.importNode(group.entries[0].template.content, true);
				content.querySelector('template')?.remove();
				button.append(content);
				const tooltip = document.createElement('template');
				tooltip.dataset.tipContent = '';
				for (const entry of group.entries) {
					const row = entry.template.content.querySelector<HTMLTemplateElement>('[data-tip-content]');
					if (!row) throw new Error('Missing timeline tooltip content.');
					tooltip.content.append(row.content.cloneNode(true));
				}
				button.append(tooltip);
				if (group.entries.length > 1) {
					const count = document.createElement('span');
					count.className = 'absolute -top-2 -right-2 min-w-4 rounded-full bg-ink px-1 text-[10px] leading-4 font-bold tabular-nums text-night-950';
					count.textContent = String(group.entries.length);
					button.append(count);
				}
				return button;
			}));
		};
		track.addEventListener('click', (event) => {
			const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-event-group]') : null;
			if (!button) return;
			button.focus({ preventScroll: true });
			selected = nearestGoldFrame(gold, Number(button.dataset.at));
			show(selected);
		}, { signal });
		for (const filter of filters) filter.addEventListener('change', renderGroups, { signal });
		let previousWidth = 0;
		this.observer = new ResizeObserver(() => {
			const width = track.getBoundingClientRect().width;
			if (width === previousWidth) return;
			previousWidth = width;
			renderGroups();
		});
		this.observer.observe(track);
		renderGroups();
	}

	disconnectedCallback() {
		this.controller?.abort();
		this.observer?.disconnect();
	}
}

if (!customElements.get('match-timeline')) customElements.define('match-timeline', MatchTimeline);
