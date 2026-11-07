const TIME_ZONE = 'Europe/Paris';

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: TIME_ZONE });
const monthYearFormatter = new Intl.DateTimeFormat('fr-FR', {
	month: 'short',
	year: 'numeric',
	timeZone: TIME_ZONE,
});

export function formatDate(timestamp: number): string {
	return dateFormatter.format(new Date(timestamp));
}

export function formatMonthYear(timestamp: number): string {
	return monthYearFormatter.format(new Date(timestamp));
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
	return `${count.toLocaleString('fr-FR')} ${count === 1 ? singular : plural}`;
}
