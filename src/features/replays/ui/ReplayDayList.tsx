'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useViewerDateTimePreferences } from '@/platform/useViewerDateTimePreferences';
import type { PublicReplaySearchItem } from '../domain/api';
import { dayKey, dayKeyDate, groupByDay, shiftDayKey } from './listDays';
import { EYEBROW, FOCUS_RING } from './listStyles';
import PlayIcon from './PlayIcon';
import { terrainName } from '../domain/terrain';

// One line per game from md up, two on phones. Every row shares one column template, so the
// columns line up down the list; --when widens the first column when it holds a date as well.
const ROW = [
	'group relative grid min-h-[56px] items-center gap-x-[8px] gap-y-[2px] px-[12px] py-[6px] text-[13px] leading-[18px]',
	"grid-cols-[auto_minmax(0,1fr)_auto_auto] [grid-template-areas:'title_title_stats_watch'_'time_meta_stats_watch']",
	"md:min-h-[44px] md:gap-x-[12px] md:py-0 md:grid-cols-[var(--when)_minmax(0,1fr)_112px_104px_44px_44px] md:[grid-template-areas:'time_title_terrain_players_stats_watch']",
	"lg:grid-cols-[var(--when)_minmax(0,520px)_176px_120px_minmax(0,1fr)_128px_112px] lg:[grid-template-areas:'time_title_terrain_players_._stats_watch']",
	'hover:bg-[#1a1a1a] active:bg-[#242424] focus-within:z-[1]',
].join(' ');
const WHEN_TIME = '[--when:48px]';
const WHEN_DATE = '[--when:168px] lg:[--when:184px]';

function ChartIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
			<path d="M5 20V11M12 20V5M19 20v-6" />
		</svg>
	);
}

type When = { iso: string | null; text: string };

function ReplayRow({ replay, when, whenWidth }: { replay: PublicReplaySearchItem; when: When; whenWidth: string }) {
	const t = useTranslations('replays');
	const id = `replay-${replay.id}`;
	const terrain = terrainName(replay.world);

	return (
		<li className={`${ROW} ${whenWidth}`}>
			<time
				id={`${id}-when`}
				dateTime={when.iso ?? undefined}
				className="whitespace-nowrap tabular-nums text-[#a3a3a3] [grid-area:time] md:text-[#d4d4d4]"
			>
				{when.text}
			</time>
			{/* The link's box is the title; its ::after stretches over the row, so the whole row opens the replay. */}
			<Link
				href={`/replays/${replay.id}`}
				aria-describedby={`${id}-when ${id}-terrain ${id}-players`}
				className="flex min-w-0 items-center gap-[8px] font-semibold text-[#f5f5f5] [grid-area:title] after:absolute after:inset-0 after:rounded-[4px] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[#d2b853]"
			>
				<span id={`${id}-title`} className="truncate">
					{replay.missionTitle}
				</span>{' '}
				<span className="shrink-0 rounded-[2px] border border-[#2c2c2c] px-[5px] text-[11px] font-semibold leading-[16px] tabular-nums text-[#a3a3a3]">
					{t('episodeShort', { episode: replay.episodeNumber })}
				</span>
			</Link>
			<span className="flex min-w-0 items-center gap-x-[6px] text-[#a3a3a3] [grid-area:meta] md:contents">
				<span aria-hidden="true" className="md:hidden">
					·
				</span>
				<span id={`${id}-terrain`} className="min-w-0 truncate text-[#d4d4d4] md:[grid-area:terrain]">
					{terrain ?? '—'}
				</span>
				<span aria-hidden="true" className="md:hidden">
					·
				</span>
				<span id={`${id}-players`} className="shrink-0 whitespace-nowrap tabular-nums md:[grid-area:players]">
					{replay.playerCount > 0 ? t('playerCount', { count: replay.playerCount }) : '—'}
				</span>
			</span>
			{replay.statsId !== null ? (
				<Link
					href={`/stats/games/${replay.statsId}`}
					aria-describedby={`${id}-title`}
					className={`relative z-[1] inline-flex size-[44px] items-center justify-center gap-[6px] justify-self-end rounded-[4px] font-semibold text-[#d4d4d4] [grid-area:stats] hover:bg-[#242424] hover:text-[#f5f5f5] lg:w-auto lg:justify-self-start lg:px-[10px] ${FOCUS_RING}`}
				>
					<span className="flex text-[#a3a3a3]">
						<ChartIcon />
					</span>
					<span className="sr-only lg:not-sr-only">{t('publicStats')}</span>
				</Link>
			) : null}
			<span
				aria-hidden="true"
				className="flex items-center justify-center gap-[8px] font-semibold text-[#d2b853] [grid-area:watch] group-hover:text-[#dcc56c] group-active:text-[#bca243] lg:justify-start"
			>
				<span className="flex size-[24px] items-center justify-center rounded-full bg-[#d2b853] text-[#0a0a0a] group-hover:bg-[#dcc56c] group-active:bg-[#bca243]">
					<PlayIcon className="size-[12px] translate-x-[1px]" />
				</span>
				<span className="hidden lg:inline">{t('publicWatch')}</span>
			</span>
		</li>
	);
}

function subscribeToReturn(onChange: () => void) {
	window.addEventListener('focus', onChange);
	document.addEventListener('visibilitychange', onChange);
	return () => {
		window.removeEventListener('focus', onChange);
		document.removeEventListener('visibilitychange', onChange);
	};
}

/** A page left open past midnight relabels its days when the viewer comes back to it. */
function useToday(timeZone: string | null): string | null {
	return useSyncExternalStore(
		subscribeToReturn,
		() => (timeZone ? dayKey(Date.now() / 1000, timeZone) : null),
		() => null
	);
}

// Days and times are the viewer's, which only the browser knows. The server's render groups by
// UTC day and leaves the times out until the page knows the zone, rather than showing hours that
// are about to change.
export default function ReplayDayList({ replays, byDay }: { replays: PublicReplaySearchItem[]; byDay: boolean }) {
	const t = useTranslations('replays');
	const locale = useLocale();
	const { timeZone } = useViewerDateTimePreferences();
	const today = useToday(timeZone);

	const dayFormat = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }), [locale]);
	// 24-hour times keep the time column one width, so it reads straight down the list.
	const whenFormats = useMemo(() => {
		if (!timeZone) return null;
		const time = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone } as const;
		return {
			time: new Intl.DateTimeFormat(locale, time),
			date: new Intl.DateTimeFormat(locale, { ...time, day: 'numeric', month: 'short' }),
			dateWithYear: new Intl.DateTimeFormat(locale, { ...time, day: 'numeric', month: 'short', year: 'numeric' }),
		};
	}, [locale, timeZone]);

	const whenOf = (replay: PublicReplaySearchItem): When => {
		if (replay.startedAt === null) return { iso: null, text: '—' };
		const date = new Date(replay.startedAt * 1000);
		const iso = date.toISOString();
		if (!whenFormats || !timeZone) return { iso, text: '' };
		if (byDay) return { iso, text: whenFormats.time.format(date) };
		// A phone row has little room, so the year is left to games of earlier years.
		const thisYear = today !== null && dayKey(replay.startedAt, timeZone).slice(0, 4) === today.slice(0, 4);
		return { iso, text: (thisYear ? whenFormats.date : whenFormats.dateWithYear).format(date) };
	};

	const dayLabel = (key: string | null): string => {
		if (key === null) return t('dayUnknown');
		if (today !== null && key === today) return t('dayToday');
		if (today !== null && key === shiftDayKey(today, -1)) return t('dayYesterday');
		return dayFormat.format(dayKeyDate(key));
	};

	const surface = 'rounded-[8px] border border-[#1e1e1e] bg-[#121212]';
	const rows = 'divide-y divide-[#1e1e1e]';

	// Sorted by players, neighbouring games are days apart, so each row carries its date instead.
	if (!byDay) {
		return (
			<ul className={`${surface} ${rows} [&>li:first-child]:rounded-t-[7px] [&>li:last-child]:rounded-b-[7px]`}>
				{replays.map((replay) => (
					<ReplayRow key={replay.id} replay={replay} when={whenOf(replay)} whenWidth={WHEN_DATE} />
				))}
			</ul>
		);
	}

	return (
		<div className={`${surface} [&>section:last-child>ul>li:last-child]:rounded-b-[7px]`}>
			{groupByDay(replays, timeZone ?? 'UTC').map((day, index) => (
				<section key={`${day.key}-${index}`} aria-labelledby={`replay-day-${index}`} className="border-t border-[#2c2c2c] first:border-t-0">
					<h2 id={`replay-day-${index}`} className={`flex h-[32px] items-center border-b border-[#1e1e1e] px-[12px] ${EYEBROW}`}>
						{/* The server and the browser may word a date differently; the browser's wording stands. */}
						<time dateTime={day.key ?? undefined} suppressHydrationWarning>
							{dayLabel(day.key)}
						</time>
					</h2>
					<ul className={rows}>
						{day.replays.map((replay) => (
							<ReplayRow key={replay.id} replay={replay} when={whenOf(replay)} whenWidth={WHEN_TIME} />
						))}
					</ul>
				</section>
			))}
		</div>
	);
}
