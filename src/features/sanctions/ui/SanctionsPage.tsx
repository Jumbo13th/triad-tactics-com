'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { parsePublicSanctionsResponse, type PublicSanctionsResponse, isActiveSanction, localizeReason } from '@/features/sanctions/domain/api';
import { formatLocalizedDateTime } from '@/platform/dateTime';
import { useViewerDateTimePreferences } from '@/platform/useViewerDateTimePreferences';
import { TypeBadge } from './SanctionBadges';
import type { SanctionType } from '@/features/sanctions/domain/types';

function StatusBadge({ sanction, t }: { sanction: { cancelled_at: string | null; expires_at: string | null }; t: (key: string) => string }) {
	if (sanction.cancelled_at) {
		return <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-neutral-400">{t('statusCancelled')}</span>;
	}
	if (isActiveSanction(sanction)) {
		return <span className="inline-flex items-center rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-semibold text-red-400">{t('statusActive')}</span>;
	}
	return <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-neutral-400">{t('statusExpired')}</span>;
}

export default function SanctionsPage() {
	const ts = useTranslations('sanctions');
	const locale = useLocale();
	const { timeZone, hourCycle } = useViewerDateTimePreferences();
	const fmtDate = (iso: string) => formatLocalizedDateTime(iso, { locale, timeZone, hourCycle, dateStyle: 'medium', timeStyle: 'short' }) ?? iso;
	type TabFilter = 'all' | SanctionType;
	const [data, setData] = useState<PublicSanctionsResponse | null>(null);
	const [page, setPage] = useState(1);
	const [query, setQuery] = useState('');
	const [debouncedQuery, setDebouncedQuery] = useState('');
	const [tab, setTab] = useState<TabFilter>('all');
	const [activeOnly, setActiveOnly] = useState(false);
	const [error, setError] = useState('');
	const searchRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const timeout = setTimeout(() => {
			setDebouncedQuery(query);
			setPage(1);
		}, 250);
		return () => clearTimeout(timeout);
	}, [query]);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			setError('');
			try {
				const params = new URLSearchParams({ page: String(page) });
				if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim());
				if (tab !== 'all') params.set('type', tab);
				if (activeOnly) params.set('status', 'active');
				const res = await fetch(`/api/sanctions?${params}`);
				const json = await res.json();
				const parsed = parsePublicSanctionsResponse(json);
				if (cancelled) return;
				if (parsed) setData(parsed);
				else setError(ts('loadError'));
			} catch {
				if (!cancelled) setError(ts('loadError'));
			}
		})();
		return () => { cancelled = true; };
	}, [page, debouncedQuery, tab, activeOnly, ts]);

	return (
		<section className="grid gap-6">
			<div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-8">
				<h2 className="text-2xl font-semibold tracking-tight text-neutral-50 sm:text-3xl">{ts('title')}</h2>
				<p className="mt-2 max-w-2xl text-sm text-neutral-300 sm:text-base">{ts('subtitle')}</p>
			</div>

			<div className="grid gap-3 sm:flex sm:items-center">
				<div className="flex flex-wrap items-center gap-2">
					{([['all', ts('tabAll')], ['site_ban', ts('tabSiteBan')], ['server_ban', ts('tabServerBan')], ['strike', ts('tabStrike')]] as const).map(([key, label]) => (
						<button
							key={key}
							type="button"
							onClick={() => { setTab(key); setPage(1); }}
							className={
								'inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold transition-colors ' +
								(tab === key
									? 'bg-[color:var(--accent)] text-neutral-950'
									: 'bg-white/10 text-neutral-50 hover:bg-white/20')
							}
						>
							{label}
						</button>
					))}
					<span className="mx-1 hidden h-5 w-px bg-neutral-700 sm:inline-block" aria-hidden="true" />
					<button
						type="button"
						onClick={() => { setActiveOnly((v) => !v); setPage(1); }}
						className={
							'inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold transition-colors ' +
							(activeOnly
								? 'bg-red-500/20 text-red-400'
								: 'bg-white/10 text-neutral-50 hover:bg-white/20')
						}
					>
						{ts('statusActive')}
					</button>
				</div>
				<div className="relative w-full sm:ml-auto sm:w-64">
					<input
						ref={searchRef}
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder={ts('searchPlaceholder')}
						className="h-9 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-3 pr-10 text-sm text-neutral-100 placeholder:text-neutral-500 shadow-sm shadow-black/20 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950"
					/>
					{query ? (
						<button
							type="button"
							onClick={() => { setQuery(''); searchRef.current?.focus(); }}
							className="absolute right-0.5 top-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700 bg-neutral-950 text-neutral-200 shadow-sm shadow-black/30 hover:border-neutral-500 hover:bg-white/5 hover:text-neutral-50"
							aria-label="Clear"
						>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
						</button>
					) : null}
				</div>
			</div>

			{error ? (
				<p className="text-sm text-red-300">{error}</p>
			) : null}

			{data && data.sanctions.length === 0 ? (
				<div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/70 p-5 shadow-sm shadow-black/20 sm:p-8">
					<p className="text-sm text-neutral-400">{debouncedQuery.trim() || tab !== 'all' || activeOnly ? ts('noMatches') : ts('noSanctions')}</p>
				</div>
			) : null}

			{data && data.sanctions.length > 0 ? (
				<div className="grid gap-3">
					{data.sanctions.map((s) => {
						const isActive = isActiveSanction(s);
						return (
							<div
								key={s.id}
								className={
									'rounded-2xl border p-4 shadow-sm shadow-black/20 transition sm:p-5' +
									(isActive
										? ' border-red-500/20 bg-neutral-950'
										: ' border-neutral-800 bg-neutral-950/60 opacity-70')
								}
							>
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div className="flex flex-wrap items-center gap-2">
										<span className="text-base font-semibold text-neutral-50">{s.callsign ?? '—'}</span>
										<TypeBadge type={s.type} t={ts} />
										<StatusBadge sanction={s} t={ts} />
										{s.auto_generated ? (
											<span className="text-xs text-neutral-500">({ts('autoGenerated')})</span>
										) : null}
									</div>
								</div>
								{s.reason ? (
									<p className="mt-2 text-sm text-neutral-300">{localizeReason(s.reason, ts)}</p>
								) : null}
								<div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
									<span>{ts('created')}: {fmtDate(s.created_at)}</span>
									<span>{ts('expires')}: {s.expires_at ? fmtDate(s.expires_at) : ts('permanent')}</span>
									{s.issued_by ? (
										<span>{ts('issuedBy')}: {s.issued_by}</span>
									) : null}
									{s.cancelled_by ? (
										<span>{ts('cancelledBy')}: {s.cancelled_by}</span>
									) : null}
								</div>
								{s.cancelled_reason ? (
									<p className="mt-2 text-xs italic text-neutral-500">
										{ts('cancelReason')}: {localizeReason(s.cancelled_reason, ts)}
									</p>
								) : null}
								{s.original_expires_at ? (
									<p className="mt-1 text-xs italic text-neutral-500">
										{s.expires_updated_by
											? ts('expiryChanged', { original: fmtDate(s.original_expires_at), who: s.expires_updated_by })
											: ts('expiryChangedNoPrev', { who: '—' })}
									</p>
								) : null}
							</div>
						);
					})}
				</div>
			) : null}

			{data && data.totalPages > 1 ? (
				<div className="flex items-center justify-center gap-2">
					<button
						type="button"
						disabled={page <= 1}
						onClick={() => setPage((p) => p - 1)}
						className="inline-flex items-center rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-300 transition hover:bg-neutral-800 disabled:opacity-40"
					>
						&#8592;
					</button>
					<span className="text-sm text-neutral-400">{page} / {data.totalPages}</span>
					<button
						type="button"
						disabled={page >= data.totalPages}
						onClick={() => setPage((p) => p + 1)}
						className="inline-flex items-center rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-300 transition hover:bg-neutral-800 disabled:opacity-40"
					>
						&#8594;
					</button>
				</div>
			) : null}
		</section>
	);
}
