'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { ReplaySearchPage } from '../domain/api';
import { hasListFilters, type ReplayListFilters } from '../domain/search';
import { dayKeyDate } from './listDays';
import { FOCUS_RING } from './listStyles';
import { pageWindow, replaysListHref } from './pagination';
import ReplayDayList from './ReplayDayList';
import ReplayFilters from './ReplayFilters';

function CloseIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
			<path d="M6 6l12 12M18 6L6 18" />
		</svg>
	);
}

function Chevron({ next }: { next: boolean }) {
	return (
		<svg
			className={`size-[16px] ${next ? 'rotate-180 rtl:rotate-0' : 'rtl:rotate-180'}`}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M15 18l-6-6 6-6" />
		</svg>
	);
}

type Chip = { field: Exclude<keyof ReplayListFilters, 'sort'>; label: string };

// Each active filter, removable on its own; the sort is not a filter and stays.
function FilterChips({ result }: { result: ReplaySearchPage }) {
	const t = useTranslations('replays');
	const locale = useLocale();
	const { filters, facets } = result;
	// Days are UTC days, so they are written in UTC whatever the viewer's zone.
	const day = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(dayKeyDate(value));

	const chips: Chip[] = [];
	if (filters.query) chips.push({ field: 'query', label: t('chipQuery', { query: filters.query }) });
	if (filters.mission) {
		chips.push({ field: 'mission', label: facets.missions.find((m) => m.shortCode === filters.mission)?.title || filters.mission });
	}
	if (filters.terrain) chips.push({ field: 'terrain', label: filters.terrain });
	if (filters.from) chips.push({ field: 'from', label: t('chipFrom', { date: day(filters.from) }) });
	if (filters.to) chips.push({ field: 'to', label: t('chipTo', { date: day(filters.to) }) });
	if (chips.length === 0) return null;

	return (
		<>
			<ul className="flex flex-wrap items-center gap-x-[8px]">
				{chips.map((chip) => (
					<li key={chip.field} className="flex">
						<Link
							href={replaysListHref({ ...filters, [chip.field]: '' }, 1)}
							scroll={false}
							aria-label={t('filterRemove', { filter: chip.label })}
							className="group inline-flex min-h-[44px] items-center focus-visible:outline-none"
						>
							<span className="inline-flex h-[28px] max-w-[280px] items-center gap-[6px] rounded-[4px] border border-[#2c2c2c] bg-[#1a1a1a] ps-[10px] pe-[6px] text-[#d4d4d4] group-hover:border-[#666666] group-hover:bg-[#242424] group-hover:text-[#f5f5f5] group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-[#d2b853]">
								{/* A date is worded by the server's and the browser's own Intl, which may differ slightly. */}
								<span className="truncate" suppressHydrationWarning>
									{chip.label}
								</span>
								<span className="flex text-[#a3a3a3]">
									<CloseIcon />
								</span>
							</span>
						</Link>
					</li>
				))}
			</ul>
			<Link
				href={replaysListHref({ query: '', terrain: '', mission: '', from: '', to: '', sort: filters.sort }, 1)}
				scroll={false}
				className={`inline-flex min-h-[44px] items-center rounded-[4px] px-[6px] font-semibold text-[#d2b853] hover:text-[#dcc56c] active:text-[#bca243] ${FOCUS_RING}`}
			>
				{t('filtersClear')}
			</Link>
		</>
	);
}

function Pagination({ filters, page, totalPages }: { filters: ReplayListFilters; page: number; totalPages: number }) {
	const t = useTranslations('replays');
	const cell =
		'inline-flex h-[44px] min-w-[44px] items-center justify-center gap-[6px] rounded-[4px] border px-[12px] text-[13px] font-semibold leading-[18px] tabular-nums';
	const link = `${cell} border-[#2c2c2c] bg-[#121212] text-[#d4d4d4] hover:border-[#666666] hover:bg-[#1a1a1a] hover:text-[#f5f5f5] active:bg-[#242424] ${FOCUS_RING}`;
	const unavailable = `${cell} border-[#1e1e1e] text-[#666666]`;

	return (
		<nav aria-label={t('pagination')} className="flex justify-center">
			<ul className="flex flex-wrap items-center justify-center gap-[8px]">
				{page > 1 ? (
					<li>
						<Link href={replaysListHref(filters, page - 1)} rel="prev" className={link}>
							<Chevron next={false} />
							{t('pagePrev')}
						</Link>
					</li>
				) : (
					<li aria-hidden="true">
						<span className={unavailable}>
							<Chevron next={false} />
							{t('pagePrev')}
						</span>
					</li>
				)}
				{pageWindow(page, totalPages).map((n, index) =>
					n === null ? (
						<li key={`gap-${index}`} aria-hidden="true" className="px-[4px] text-[#a3a3a3]">
							…
						</li>
					) : (
						<li key={n}>
							{n === page ? (
								<span aria-current="page" className={`${cell} border-[#d2b853] bg-[#d2b853]/10 text-[#d2b853]`}>
									<span className="sr-only">{t('pageNumber', { page: n })}</span>
									<span aria-hidden="true">{n}</span>
								</span>
							) : (
								<Link href={replaysListHref(filters, n)} aria-label={t('pageNumber', { page: n })} className={link}>
									{n}
								</Link>
							)}
						</li>
					)
				)}
				{page < totalPages ? (
					<li>
						<Link href={replaysListHref(filters, page + 1)} rel="next" className={link}>
							{t('pageNext')}
							<Chevron next />
						</Link>
					</li>
				) : (
					<li aria-hidden="true">
						<span className={unavailable}>
							{t('pageNext')}
							<Chevron next />
						</span>
					</li>
				)}
			</ul>
		</nav>
	);
}

export default function ReplaysListPage({ result }: { result: ReplaySearchPage }) {
	const t = useTranslations('replays');
	const { filters, facets, total, page, totalPages, replays } = result;
	const filtered = hasListFilters(filters);

	let status: string;
	if (total > 0) status = filtered ? t('filteredCount', { count: total }) : t('listCount', { count: total });
	else status = filtered ? t('noResultsFiltered') : t('publicEmpty');

	return (
		<section className="flex w-full flex-col gap-[12px] text-[13px] leading-[18px]">
			<header className="flex flex-wrap items-baseline gap-x-[12px] gap-y-[2px]">
				<h1 className="text-[20px] font-semibold leading-[28px] tracking-[-0.01em] text-[#f5f5f5]">{t('publicTitle')}</h1>
				<p className="text-[#a3a3a3]">{t('publicSubtitle')}</p>
			</header>

			{total > 0 || filtered ? <ReplayFilters filters={filters} facets={facets} /> : null}

			<div className="flex min-h-[44px] flex-wrap items-center gap-x-[8px]">
				{/* One live region for every outcome, so a search that finds nothing is announced too. */}
				<div role="status" className="me-[4px] tabular-nums text-[#d4d4d4] [overflow-wrap:anywhere]">
					{status}
				</div>
				{filtered ? <FilterChips result={result} /> : null}
			</div>

			{replays.length > 0 ? <ReplayDayList replays={replays} byDay={filters.sort !== 'players'} /> : null}

			{totalPages > 1 ? <Pagination filters={filters} page={page} totalPages={totalPages} /> : null}
		</section>
	);
}
