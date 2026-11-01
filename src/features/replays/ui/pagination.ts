import { DEFAULT_REPLAY_SORT, type ReplayListFilters } from '../domain/search';

/** Filters left at their defaults stay out of the address, so a plain list keeps a plain link. */
export function replaysListHref(filters: ReplayListFilters, page: number): string {
	const params = new URLSearchParams();
	if (filters.query) params.set('q', filters.query);
	if (filters.mission) params.set('mission', filters.mission);
	if (filters.terrain) params.set('terrain', filters.terrain);
	if (filters.from) params.set('from', filters.from);
	if (filters.to) params.set('to', filters.to);
	if (filters.sort !== DEFAULT_REPLAY_SORT) params.set('sort', filters.sort);
	if (page > 1) params.set('page', String(page));
	const search = params.toString();
	return search ? `/replays?${search}` : '/replays';
}

/**
 * The page numbers to link, null where a run of pages is left out: the first and last
 * page, the neighbours of the current one, and the first or last four near either end.
 */
export function pageWindow(page: number, totalPages: number): (number | null)[] {
	const wanted = [1, page - 1, page, page + 1, totalPages];
	if (page <= 3) wanted.push(2, 3, 4);
	if (page >= totalPages - 2) wanted.push(totalPages - 3, totalPages - 2, totalPages - 1);
	const shown = [...new Set(wanted)].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);

	const items: (number | null)[] = [];
	let last = 0;
	for (const n of shown) {
		// One missing page is shown itself: an ellipsis would take the same room.
		if (n - last === 2) items.push(last + 1);
		else if (n - last > 2) items.push(null);
		items.push(n);
		last = n;
	}
	return items;
}
