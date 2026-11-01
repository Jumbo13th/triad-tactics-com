'use client';

import Form from 'next/form';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { formatLocalizedDateTime } from '@/platform/dateTime';
import { useViewerDateTimePreferences } from '@/platform/useViewerDateTimePreferences';
import type { PublicReplaySearchItem, ReplaySearchPage } from '../domain/api';
import { REPLAY_SEARCH_MAX_LENGTH } from '../domain/search';
import { pageWindow, replaysListHref } from './pagination';
import PlayIcon from './PlayIcon';
import { terrainName } from './terrainName';

const FOCUS_RING =
	'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]';
const SECONDARY_BUTTON = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-700 px-4 text-sm font-semibold text-neutral-100 transition hover:bg-white/5 ${FOCUS_RING}`;
const PRIMARY_BUTTON = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[color:var(--accent)] px-4 text-sm font-semibold text-neutral-950 transition hover:opacity-95 ${FOCUS_RING}`;

function SearchForm({ query }: { query: string }) {
	const t = useTranslations('replays');
	const locale = useLocale();
	// The field follows the query when the page changes it (Clear, back and forward) without
	// being remounted, which would take the focus away from someone who just pressed Enter.
	const [text, setText] = useState(query);
	const [shownQuery, setShownQuery] = useState(query);
	if (shownQuery !== query) {
		setShownQuery(query);
		setText(query);
	}

	return (
		<Form action={`/${locale}/replays`} prefetch={false} role="search" className="grid gap-2">
			<label htmlFor="replay-search" className="text-sm font-semibold text-neutral-200">
				{t('searchLabel')}
			</label>
			<div className="flex flex-wrap gap-2">
				<input
					id="replay-search"
					name="q"
					type="search"
					value={text}
					onChange={(event) => setText(event.target.value)}
					maxLength={REPLAY_SEARCH_MAX_LENGTH}
					enterKeyHint="search"
					autoComplete="off"
					spellCheck={false}
					aria-describedby="replay-search-hint"
					className={`min-h-11 min-w-0 flex-1 basis-64 rounded-xl border border-neutral-700 bg-neutral-900 px-4 text-base text-neutral-50 placeholder:text-neutral-500 ${FOCUS_RING}`}
				/>
				<button type="submit" className={PRIMARY_BUTTON}>
					{t('searchSubmit')}
				</button>
				{query ? (
					<Link href="/replays" className={SECONDARY_BUTTON}>
						{t('searchClear')}
					</Link>
				) : null}
			</div>
			<p id="replay-search-hint" className="text-xs text-neutral-500">
				{t('searchHint')}
			</p>
		</Form>
	);
}

function ReplayCard({ replay, played }: { replay: PublicReplaySearchItem; played: { iso: string; text: string | null } | null }) {
	const t = useTranslations('replays');
	const terrain = terrainName(replay.world);
	const titleId = `replay-${replay.id}-title`;

	return (
		<li className="flex">
			<article
				aria-labelledby={titleId}
				className="flex w-full flex-col gap-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20"
			>
				<div className="grid gap-1.5">
					<p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--accent)]">
						{t('publicEpisode', { episode: replay.episodeNumber })}
					</p>
					<h2 id={titleId} className="text-lg font-semibold leading-snug text-neutral-50 [overflow-wrap:anywhere]">
						{replay.missionTitle}
					</h2>
				</div>
				<dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
					<dt className="text-neutral-500">{t('cardTerrain')}</dt>
					<dd className="text-neutral-200 [overflow-wrap:anywhere]">{terrain ?? '—'}</dd>
					<dt className="text-neutral-500">{t('cardPlayed')}</dt>
					<dd className="text-neutral-200">{played ? <time dateTime={played.iso}>{played.text}</time> : '—'}</dd>
					<dt className="text-neutral-500">{t('cardPlayers')}</dt>
					<dd className="tabular-nums text-neutral-200">{replay.playerCount > 0 ? replay.playerCount : '—'}</dd>
				</dl>
				<div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
					<Link href={`/replays/${replay.id}`} aria-describedby={titleId} className={PRIMARY_BUTTON}>
						<PlayIcon className="h-4 w-4" />
						{t('publicWatch')}
					</Link>
					{replay.statsId !== null ? (
						<Link href={`/stats/games/${replay.statsId}`} aria-describedby={titleId} className={SECONDARY_BUTTON}>
							{t('publicStats')}
						</Link>
					) : null}
				</div>
			</article>
		</li>
	);
}

function Chevron({ next }: { next: boolean }) {
	return (
		<svg
			className={`h-4 w-4 ${next ? 'rotate-180 rtl:rotate-0' : 'rtl:rotate-180'}`}
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			strokeWidth={2}
			stroke="currentColor"
			aria-hidden="true"
		>
			<path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
		</svg>
	);
}

function Pagination({ query, page, totalPages }: { query: string; page: number; totalPages: number }) {
	const t = useTranslations('replays');
	const cell = 'inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl border px-3 text-sm font-semibold';
	const link = `${cell} border-neutral-700 text-neutral-200 transition hover:bg-white/5 ${FOCUS_RING}`;
	const unavailable = `${cell} border-neutral-800 text-neutral-600`;

	return (
		<nav aria-label={t('pagination')} className="flex justify-center">
			<ul className="flex flex-wrap items-center justify-center gap-2">
				{page > 1 ? (
					<li>
						<Link href={replaysListHref(query, page - 1)} rel="prev" className={link}>
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
						<li key={`gap-${index}`} aria-hidden="true" className="px-1 text-neutral-500">
							…
						</li>
					) : (
						<li key={n}>
							{n === page ? (
								<span
									aria-current="page"
									className={`${cell} border-[color:var(--accent)] bg-[color:var(--accent)]/10 text-[color:var(--accent)]`}
								>
									<span className="sr-only">{t('pageNumber', { page: n })}</span>
									<span aria-hidden="true">{n}</span>
								</span>
							) : (
								<Link href={replaysListHref(query, n)} aria-label={t('pageNumber', { page: n })} className={link}>
									{n}
								</Link>
							)}
						</li>
					)
				)}
				{page < totalPages ? (
					<li>
						<Link href={replaysListHref(query, page + 1)} rel="next" className={link}>
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
	const locale = useLocale();
	const { timeZone, hourCycle } = useViewerDateTimePreferences();
	const { query, total, page, totalPages, replays } = result;

	const playedOf = (replay: PublicReplaySearchItem) => {
		if (replay.startedAt === null) return null;
		const iso = new Date(replay.startedAt * 1000).toISOString();
		return { iso, text: formatLocalizedDateTime(iso, { locale, timeZone, hourCycle }) };
	};

	return (
		<section className="mx-auto grid w-full max-w-[1600px] gap-6">
			<header className="grid gap-2">
				<h1 className="text-2xl font-semibold tracking-tight text-neutral-50 sm:text-3xl">{t('publicTitle')}</h1>
				<p className="max-w-3xl text-sm text-neutral-400">{t('publicSubtitle')}</p>
			</header>

			{total > 0 || query ? <SearchForm query={query} /> : null}

			{/* One live region for both outcomes, so a search that finds nothing is announced too. */}
			<div role="status">
				{total === 0 ? (
					<p className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6 text-sm text-neutral-300 [overflow-wrap:anywhere]">
						{query ? t('noResults', { query }) : t('publicEmpty')}
					</p>
				) : (
					<p className="text-sm text-neutral-400 [overflow-wrap:anywhere]">
						{query ? t('searchCount', { count: total, query }) : t('listCount', { count: total })}
					</p>
				)}
			</div>

			{replays.length > 0 ? (
				<ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
					{replays.map((replay) => (
						<ReplayCard key={replay.id} replay={replay} played={playedOf(replay)} />
					))}
				</ul>
			) : null}

			{totalPages > 1 ? <Pagination query={query} page={page} totalPages={totalPages} /> : null}
		</section>
	);
}
