const TIME_ZONE = 'Europe/Paris';

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: TIME_ZONE });
const monthYearFormatter = new Intl.DateTimeFormat('fr-FR', {
	month: 'short',
	year: 'numeric',
	timeZone: TIME_ZONE,
});
const shortDateFormatter = new Intl.DateTimeFormat('fr-FR', {
	weekday: 'short',
	day: 'numeric',
	month: 'short',
	timeZone: TIME_ZONE,
});
const timeFormatter = new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short', timeZone: TIME_ZONE });
const percentFormatter = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const compactFormatter = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });

export function formatDate(timestamp: number): string {
	return dateFormatter.format(new Date(timestamp));
}

export function formatMonthYear(timestamp: number): string {
	return monthYearFormatter.format(new Date(timestamp));
}

/** « mer. 5 nov. » */
export function formatShortDate(timestamp: number): string {
	return shortDateFormatter.format(new Date(timestamp));
}

export function formatTime(timestamp: number): string {
	return timeFormatter.format(new Date(timestamp));
}

export function formatDuration(durationS: number): string {
	const totalMinutes = Math.floor(durationS / 60);
	const seconds = String(durationS % 60).padStart(2, '0');
	return `${totalMinutes}:${seconds}`;
}

export function formatPercent(value: number): string {
	return percentFormatter.format(value);
}

export function formatDecimal(value: number): string {
	return decimalFormatter.format(value);
}

/** « 12,4 k » */
export function formatCompact(value: number): string {
	return compactFormatter.format(value);
}

export function formatKda(kills: number, deaths: number, assists: number): string {
	return `${kills} / ${deaths} / ${assists}`;
}

export function formatKdaIndicator(kills: number, deaths: number, assists: number): string {
	return (+((kills + assists) / Math.max(1, deaths)).toFixed(2)).toString()
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
	return `${count.toLocaleString('fr-FR')} ${count === 1 ? singular : plural}`;
}
