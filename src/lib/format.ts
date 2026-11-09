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
	return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(kdaRatio(kills, deaths, assists));
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
	return `${count.toLocaleString('fr-FR')} ${count === 1 ? singular : plural}`;
}

const relativeFormatter = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' });
const DAY_MS = 86_400_000;

/** « hier », « il y a 3 semaines »… — arrondi au jour, à la semaine, au mois puis à l'année. */
export function formatSince(timestamp: number, now = Date.now()): string {
	const days = Math.round((timestamp - now) / DAY_MS);
	if (Math.abs(days) < 7) return relativeFormatter.format(days, 'day');
	if (Math.abs(days) < 35) return relativeFormatter.format(Math.round(days / 7), 'week');
	if (Math.abs(days) < 365) return relativeFormatter.format(Math.round(days / 30), 'month');
	return relativeFormatter.format(Math.round(days / 365), 'year');
}

export interface RecordSummary {
	games: number;
	wins: number;
	lastPlayedAt?: number | null;
	kda?: number | null;
}

/**
 * Texte de bulle pour un bilan : effectifs toujours visibles, taux uniquement
 * à partir de `minimumGames` parties.
 */
export function recordTip(record: RecordSummary, minimumGames: number, now = Date.now()): string {
	const lines = [`${pluralize(record.games, 'partie')} · ${record.wins} V – ${record.games - record.wins} D`];
	if (record.games >= minimumGames && record.games > 0) lines.push(`${formatPercent(record.wins / record.games)} de victoires`);
	if (record.kda !== undefined && record.kda !== null) lines.push(`KDA ${formatDecimal(record.kda)}`);
	if (record.lastPlayedAt) lines.push(`Dernière : ${formatSince(record.lastPlayedAt, now)}`);
	return lines.join('\n');
}
import { kdaRatio } from './stats/shared';
