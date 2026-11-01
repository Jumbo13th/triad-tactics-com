import { describe, expect, it } from 'vitest';
import type { ReplayListFilters } from '@/features/replays/domain/search';
import { pageWindow, replaysListHref } from '@/features/replays/ui/pagination';

const plain: ReplayListFilters = { query: '', terrain: '', mission: '', from: '', to: '', sort: 'newest' };

describe('replay list pagination', () => {
	it('keeps the search in page links and leaves the first page bare', () => {
		expect(replaysListHref(plain, 1)).toBe('/replays');
		expect(replaysListHref(plain, 3)).toBe('/replays?page=3');
		expect(replaysListHref({ ...plain, query: 'тонкая нить' }, 1)).toBe(`/replays?q=${encodeURIComponent('тонкая нить').replace(/%20/g, '+')}`);
		expect(replaysListHref({ ...plain, query: 'a&b' }, 2)).toBe('/replays?q=a%26b&page=2');
	});

	it('keeps every filter in page links and leaves out the default sort', () => {
		const filters: ReplayListFilters = {
			query: 'eden',
			terrain: 'Belleau Wood',
			mission: 'GAW',
			from: '2026-10-01',
			to: '2026-10-31',
			sort: 'players',
		};
		expect(replaysListHref(filters, 2)).toBe(
			'/replays?q=eden&mission=GAW&terrain=Belleau+Wood&from=2026-10-01&to=2026-10-31&sort=players&page=2'
		);
		expect(replaysListHref({ ...plain, sort: 'oldest' }, 1)).toBe('/replays?sort=oldest');
		expect(replaysListHref({ ...plain, terrain: 'Arland' }, 1)).toBe('/replays?terrain=Arland');
	});

	it('links the ends, the neighbours and runs near either end', () => {
		expect(pageWindow(1, 1)).toEqual([1]);
		expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
		expect(pageWindow(1, 10)).toEqual([1, 2, 3, 4, null, 10]);
		expect(pageWindow(6, 10)).toEqual([1, null, 5, 6, 7, null, 10]);
		expect(pageWindow(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
		expect(pageWindow(4, 10)).toEqual([1, 2, 3, 4, 5, null, 10]);
		expect(pageWindow(10, 10)).toEqual([1, null, 7, 8, 9, 10]);
	});
});
