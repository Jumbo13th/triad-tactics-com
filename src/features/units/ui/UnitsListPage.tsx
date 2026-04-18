'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

type UnitSummary = {
	id: number;
	name: string;
	tag: string;
	description: string;
	status: string;
	leaderCallsign: string | null;
	memberCount: number;
	slotsAllocated: number;
	updatedAt: string;
	hasAvatar: boolean;
};

export default function UnitsListPage() {
	const t = useTranslations('units');
	const [units, setUnits] = useState<UnitSummary[]>([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(true);
	const [hasUnit, setHasUnit] = useState(true);
	const [slotsFilter, setSlotsFilter] = useState<boolean | undefined>(undefined);
	const [query, setQuery] = useState('');
	const [debouncedQuery, setDebouncedQuery] = useState('');
	const searchRef = useRef<HTMLInputElement>(null);
	const pageSize = 20;

	useEffect(() => {
		const handle = window.setTimeout(() => {
			setDebouncedQuery(query);
			setPage(1);
		}, 250);
		return () => window.clearTimeout(handle);
	}, [query]);

	useEffect(() => {
		let cancelled = false;
		const params = new URLSearchParams();
		params.set('page', String(page));
		params.set('pageSize', String(pageSize));
		if (slotsFilter === true) params.set('hasSlots', 'true');
		if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim());
		fetch(`/api/units?${params}`)
			.then(r => r.json())
			.then(data => {
				if (cancelled) return;
				setUnits(data.units ?? []);
				setTotal(data.total ?? 0);
				setHasUnit(data.viewer?.hasUnit ?? false);
				setLoading(false);
			})
			.catch(() => { if (!cancelled) setLoading(false); });
		return () => { cancelled = true; };
	}, [slotsFilter, debouncedQuery, page]);

	const totalPages = Math.ceil(total / pageSize);

	return (
		<section className="grid gap-6">
			<div className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900 p-5 shadow-sm shadow-black/20 sm:p-8">
				<div className="pointer-events-none absolute -top-24 right-6 h-56 w-56 rounded-full bg-[color:var(--accent)]/15 blur-3xl" aria-hidden="true" />
				<div className="pointer-events-none absolute -bottom-24 left-6 h-48 w-48 rounded-full bg-[color:var(--accent)]/10 blur-3xl" aria-hidden="true" />
				<div className="relative flex flex-wrap items-center justify-between gap-4">
					<h2 className="text-2xl font-semibold tracking-tight text-neutral-50 sm:text-3xl">{t('title')}</h2>
					{!hasUnit && (
						<Link
							href="/units/create"
							className="inline-flex items-center justify-center rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950"
						>
							{t('create')}
						</Link>
					)}
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<button
					type="button"
					onClick={() => { setSlotsFilter(undefined); setPage(1); }}
					className={
						'inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold transition-colors ' +
						(slotsFilter === undefined
							? 'bg-[color:var(--accent)] text-neutral-950'
							: 'bg-white/10 text-neutral-50 hover:bg-white/20')
					}
				>
					{t('filter.slots.all')}
				</button>
				<button
					type="button"
					onClick={() => { setSlotsFilter(true); setPage(1); }}
					className={
						'inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold transition-colors ' +
						(slotsFilter === true
							? 'bg-[color:var(--accent)] text-neutral-950'
							: 'bg-white/10 text-neutral-50 hover:bg-white/20')
					}
				>
					{t('filter.slots.with')}
				</button>
				<div className="relative ml-auto">
					<input
						ref={searchRef}
						type="text"
						value={query}
						onChange={e => setQuery(e.target.value)}
						placeholder={t('searchPlaceholder')}
						className="h-9 w-48 rounded-2xl border border-neutral-800 bg-neutral-950 px-3 pr-10 text-sm text-neutral-100 placeholder:text-neutral-500 shadow-sm shadow-black/20 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950 sm:w-64"
					/>
					{query && (
						<button
							type="button"
							onClick={() => { setQuery(''); searchRef.current?.focus(); }}
							className="absolute right-0.5 top-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700 bg-neutral-950 text-neutral-200 shadow-sm shadow-black/30 hover:border-neutral-500 hover:bg-white/5 hover:text-neutral-50"
							aria-label="Clear"
						>
							<svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
								<path d="M6 6l12 12" />
								<path d="M18 6L6 18" />
							</svg>
						</button>
					)}
				</div>
			</div>

			{loading && (
				<p className="py-8 text-center text-sm text-neutral-500">Loading…</p>
			)}
			{!loading && units.length === 0 && (
				<div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/70 p-5 shadow-sm shadow-black/20 sm:p-8">
					<p className="text-sm text-neutral-300">
						{debouncedQuery.trim() ? t('noSearchResults') : t('noUnits')}
					</p>
				</div>
			)}
			{!loading && units.length > 0 && (
				<div className="grid gap-3">
					{units.map(unit => (
						<Link
							key={unit.id}
							href={`/units/${unit.tag}`}
							className="group relative overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900 px-5 py-5 shadow-sm shadow-black/20 transition hover:border-[color:var(--accent)]/35 hover:shadow-[0_0_30px_rgba(210,184,83,0.06)] sm:px-8 sm:py-6"
						>
							<div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
								{unit.hasAvatar ? (
									<div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-neutral-900 p-1.5 ring-1 ring-neutral-800 sm:h-16 sm:w-16">
										{/* eslint-disable-next-line @next/next/no-img-element */}
										<img
											src={`/api/units/${unit.id}/avatar?v=${encodeURIComponent(unit.updatedAt)}`}
											alt={unit.name}
											loading="lazy"
											decoding="async"
											className="h-full w-full rounded object-contain opacity-0 transition-opacity duration-300"
											onLoad={e => { (e.target as HTMLImageElement).classList.remove('opacity-0'); }}
										/>
									</div>
								) : (
									<div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-[color:var(--accent)]/20 bg-[color:var(--accent)]/5 sm:h-16 sm:w-16">
										<span className="text-base font-bold tracking-widest text-[color:var(--accent)]">{unit.tag}</span>
									</div>
								)}
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-center gap-3">
										{unit.hasAvatar && (
											<span className="inline-flex items-center rounded-xl border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 px-3 py-1.5 text-sm font-bold tracking-widest text-[color:var(--accent)]">
												{unit.tag}
											</span>
										)}
										<h3 className="text-xl font-semibold tracking-tight text-neutral-50 transition-colors group-hover:text-[color:var(--accent)] sm:text-2xl">{unit.name}</h3>
									</div>
									<div className="mt-3 flex flex-wrap items-center gap-2">
										{unit.slotsAllocated > 0 && (
											<span className="inline-flex items-center rounded-full border border-neutral-800 bg-white/[0.03] px-3 py-1 text-xs font-semibold text-neutral-300">
												{t('slotsAllocated')}: {unit.slotsAllocated}
											</span>
										)}
										<span className="inline-flex items-center rounded-full border border-neutral-800 bg-white/[0.03] px-3 py-1 text-xs font-semibold text-neutral-300">
											{t('members')}: {unit.memberCount}
										</span>
										{unit.leaderCallsign && (
											<span className="inline-flex items-center rounded-full border border-neutral-800 bg-white/[0.03] px-3 py-1 text-xs font-semibold text-neutral-300">
												{t('commander')}: {unit.leaderCallsign}
											</span>
										)}
									</div>
								</div>
							</div>
					</Link>
					))}
				</div>
			)}

			{totalPages > 1 && (
				<div className="flex items-center justify-center gap-2">
					<button
						type="button"
						disabled={page <= 1}
						onClick={() => setPage(p => p - 1)}
						className="inline-flex items-center rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-300 transition hover:bg-neutral-800 disabled:opacity-40"
					>
						←
					</button>
					<span className="text-sm text-neutral-400">
						{page} / {totalPages}
					</span>
					<button
						type="button"
						disabled={page >= totalPages}
						onClick={() => setPage(p => p + 1)}
						className="inline-flex items-center rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-300 transition hover:bg-neutral-800 disabled:opacity-40"
					>
						→
					</button>
				</div>
			)}
		</section>
	);
}
