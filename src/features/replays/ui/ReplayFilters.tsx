'use client';

import { useState, type ChangeEvent, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { REPLAY_SEARCH_MAX_LENGTH, REPLAY_SORTS, type ReplayFacets, type ReplayListFilters, type ReplaySort } from '../domain/search';
import { EYEBROW, FOCUS_RING } from './listStyles';
import { replaysListHref } from './pagination';

const CONTROL = `h-[44px] w-full min-w-0 rounded-[4px] border border-[#666666] bg-[#1a1a1a] text-[13px] leading-[18px] text-[#f5f5f5] hover:border-[#a3a3a3] ${FOCUS_RING}`;

const SORT_LABELS = { newest: 'sortNewest', oldest: 'sortOldest', players: 'sortPlayers' } as const satisfies Record<ReplaySort, string>;

function SearchIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
			<circle cx="11" cy="11" r="7" />
			<path d="M20 20l-3.5-3.5" />
		</svg>
	);
}

function ChevronDownIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<path d="M6 9l6 6 6-6" />
		</svg>
	);
}

function Field({ id, label, className = '', children }: { id: string; label: string; className?: string; children: ReactNode }) {
	return (
		<div className={`flex min-w-0 flex-col gap-[6px] ${className}`}>
			<label htmlFor={id} className={EYEBROW}>
				{label}
			</label>
			{children}
		</div>
	);
}

function Select({
	id,
	name,
	value,
	onChange,
	children,
}: {
	id: string;
	name: string;
	value: string;
	onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
	children: ReactNode;
}) {
	return (
		<div className="relative">
			<select id={id} name={name} value={value} onChange={onChange} className={`${CONTROL} appearance-none truncate ps-[12px] pe-[36px]`}>
				{children}
			</select>
			<span className="pointer-events-none absolute end-[12px] top-1/2 flex -translate-y-1/2 text-[#a3a3a3]">
				<ChevronDownIcon />
			</span>
		</div>
	);
}

/** A mission run again keeps its title, so a title that repeats carries its short code. */
function missionLabel(mission: ReplayFacets['missions'][number], missions: ReplayFacets['missions']): string {
	if (!mission.title) return mission.shortCode;
	const repeated = missions.some((other) => other !== mission && other.title === mission.title);
	return repeated ? `${mission.title} (${mission.shortCode})` : mission.title;
}

// A plain GET form, so the filters work before the page's script runs and land in a link that
// can be shared. With the script, the address leaves out the fields at their defaults.
export default function ReplayFilters({ filters, facets }: { filters: ReplayListFilters; facets: ReplayFacets }) {
	const t = useTranslations('replays');
	const locale = useLocale();
	const router = useRouter();

	// The fields follow the filters when a navigation changes them (a chip, Clear, back and
	// forward) without being remounted, which would take the focus from whoever just used them.
	const applied = replaysListHref(filters, 1);
	const [draft, setDraft] = useState(filters);
	const [shown, setShown] = useState(applied);
	if (shown !== applied) {
		setShown(applied);
		setDraft(filters);
	}

	const apply = (next: ReplayListFilters) => router.push(replaysListHref({ ...next, query: next.query.trim() }, 1), { scroll: false });
	const edit = (field: 'query' | 'from' | 'to') => (event: ChangeEvent<HTMLInputElement>) =>
		setDraft({ ...draft, [field]: event.target.value });
	// A choice applies at once. Text and dates wait for Enter or the button: a date being typed
	// passes through other valid dates on the way.
	const choose = (next: ReplayListFilters) => {
		setDraft(next);
		apply(next);
	};
	const chooseSort = (event: ChangeEvent<HTMLSelectElement>) => {
		const sort = REPLAY_SORTS.find((option) => option === event.target.value);
		if (sort) choose({ ...draft, sort });
	};

	return (
		<form
			role="search"
			aria-label={t('searchLabel')}
			action={`/${locale}/replays`}
			method="get"
			onSubmit={(event) => {
				event.preventDefault();
				apply(draft);
			}}
			className="rounded-[8px] border border-[#1e1e1e] bg-[#121212] p-[12px]"
		>
			<div className="grid grid-cols-2 gap-x-[8px] gap-y-[12px] sm:grid-cols-4 xl:grid-cols-[minmax(220px,3fr)_minmax(170px,2fr)_minmax(140px,2fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(190px,1fr)_auto]">
				<Field id="replay-q" label={t('filterSearch')} className="col-span-2 xl:col-span-1">
					<div className="relative">
						<span className="pointer-events-none absolute start-[12px] top-1/2 flex -translate-y-1/2 text-[#a3a3a3]">
							<SearchIcon />
						</span>
						<input
							id="replay-q"
							name="q"
							type="search"
							value={draft.query}
							onChange={edit('query')}
							maxLength={REPLAY_SEARCH_MAX_LENGTH}
							placeholder={t('searchPlaceholder')}
							enterKeyHint="search"
							autoComplete="off"
							spellCheck={false}
							aria-describedby="replay-q-hint"
							className={`${CONTROL} ps-[36px] pe-[12px] placeholder:text-[#a3a3a3]`}
						/>
					</div>
					<p id="replay-q-hint" className="sr-only">
						{t('searchHint')}
					</p>
				</Field>

				<Field id="replay-mission" label={t('filterMission')}>
					<Select id="replay-mission" name="mission" value={draft.mission} onChange={(event) => choose({ ...draft, mission: event.target.value })}>
						<option value="">{t('filterMissionAll')}</option>
						{facets.missions.map((mission) => (
							<option key={mission.shortCode} value={mission.shortCode}>
								{missionLabel(mission, facets.missions)}
							</option>
						))}
					</Select>
				</Field>

				<Field id="replay-terrain" label={t('filterTerrain')}>
					<Select id="replay-terrain" name="terrain" value={draft.terrain} onChange={(event) => choose({ ...draft, terrain: event.target.value })}>
						<option value="">{t('filterTerrainAll')}</option>
						{facets.terrains.map((terrain) => (
							<option key={terrain} value={terrain}>
								{terrain}
							</option>
						))}
					</Select>
				</Field>

				<Field id="replay-from" label={t('filterFrom')}>
					<input id="replay-from" name="from" type="date" value={draft.from} onChange={edit('from')} className={`${CONTROL} px-[12px]`} />
				</Field>

				<Field id="replay-to" label={t('filterTo')}>
					<input id="replay-to" name="to" type="date" value={draft.to} onChange={edit('to')} className={`${CONTROL} px-[12px]`} />
				</Field>

				<Field id="replay-sort" label={t('filterSort')}>
					<Select id="replay-sort" name="sort" value={draft.sort} onChange={chooseSort}>
						{REPLAY_SORTS.map((sort) => (
							<option key={sort} value={sort}>
								{t(SORT_LABELS[sort])}
							</option>
						))}
					</Select>
				</Field>

				<button
					type="submit"
					className={`inline-flex h-[44px] w-full items-center justify-center self-end rounded-[4px] bg-[#d2b853] px-[16px] text-[13px] font-semibold leading-[18px] text-[#0a0a0a] hover:bg-[#dcc56c] active:bg-[#bca243] xl:w-auto ${FOCUS_RING}`}
				>
					{t('searchSubmit')}
				</button>
			</div>
		</form>
	);
}
