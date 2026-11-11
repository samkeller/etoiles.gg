interface NavigationContext {
	location: Pick<Location, 'href' | 'assign'>;
	history: Pick<History, 'length' | 'back'>;
	document: Pick<Document, 'referrer'>;
}

export function getBackHref(referrer: string, currentHref: string, fallback = '/history'): string {
	if (!URL.canParse(referrer)) return fallback;
	const previous = new URL(referrer);
	const current = new URL(currentHref);
	if (previous.origin !== current.origin || previous.href === current.href) return fallback;
	return previous.pathname.startsWith('//') ? previous.href : `${previous.pathname}${previous.search}${previous.hash}`;
}

export function navigateBack(fallback = '/history', context: NavigationContext = window): void {
	const previous = getBackHref(context.document.referrer, context.location.href, '');
	if (previous && context.history.length > 1) {
		context.history.back();
	} else {
		context.location.assign(previous || fallback);
	}
}
