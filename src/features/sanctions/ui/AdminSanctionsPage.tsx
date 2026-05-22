'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
	parseAdminSanctionsResponse,
	type AdminSanctionsResponse,
	parseCancelSanctionResponse,
	parseCreateSanctionResponse,
	parseUpdateExpiryResponse,
	isActiveSanction,
	localizeReason
} from '@/features/sanctions/domain/api';
import {
	AdminSurface,
	AdminToolbar,
	AdminSearchInput,
	AdminButton,
	AdminBadge,
	AdminPagination,
	AdminTabButton,
	AdminDisclosure,
	AdminField
} from '@/features/admin/ui/root';
import { formatLocalizedDateTime } from '@/platform/dateTime';
import { useViewerDateTimePreferences } from '@/platform/useViewerDateTimePreferences';
import { TypeBadge } from './SanctionBadges';
import type { SanctionType } from '@/features/sanctions/domain/types';

function utcToLocalInput(utc: string): string {
	const d = new Date(utc.endsWith('Z') ? utc : utc.replace(' ', 'T') + 'Z');
	if (isNaN(d.getTime())) return '';
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nowLocalInput(): string {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToUtc(local: string): string {
	const d = new Date(local);
	if (isNaN(d.getTime())) return local;
	return d.toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);
}

type TabFilter = 'all' | SanctionType;

const TABS: { key: TabFilter; labelKey: string }[] = [
	{ key: 'all', labelKey: 'tabAll' },
	{ key: 'site_ban', labelKey: 'tabSiteBan' },
	{ key: 'server_ban', labelKey: 'tabServerBan' },
	{ key: 'strike', labelKey: 'tabStrike' }
];

function StatusBadge({ sanction, t }: { sanction: { cancelled_at: string | null; expires_at: string | null }; t: (key: string) => string }) {
	if (sanction.cancelled_at) return <AdminBadge>{t('statusCancelled')}</AdminBadge>;
	if (isActiveSanction(sanction)) return <span className="inline-flex items-center rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-semibold text-red-400">{t('statusActive')}</span>;
	return <AdminBadge>{t('statusExpired')}</AdminBadge>;
}

export default function AdminSanctionsPage() {
	const ts = useTranslations('sanctions');
	const ta = useTranslations('admin');
	const locale = useLocale();
	const { timeZone, hourCycle } = useViewerDateTimePreferences();
	const fmtDate = (iso: string) => formatLocalizedDateTime(iso, { locale, timeZone, hourCycle, dateStyle: 'medium', timeStyle: 'short' }) ?? iso;

	const [data, setData] = useState<AdminSanctionsResponse | null>(null);
	const [tab, setTab] = useState<TabFilter>('all');
	const [query, setQuery] = useState('');
	const [page, setPage] = useState(1);
	const [error, setError] = useState('');
	const [showForm, setShowForm] = useState(false);

	const [formUserId, setFormUserId] = useState('');
	const [formUserSearch, setFormUserSearch] = useState('');
	const [formType, setFormType] = useState<SanctionType>('strike');
	const [formReason, setFormReason] = useState('');
	const [formDuration, setFormDuration] = useState<string>('7');
	const [formPermanent, setFormPermanent] = useState(false);
	const [formBusy, setFormBusy] = useState(false);
	const [formError, setFormError] = useState('');
	const [formSuccess, setFormSuccess] = useState('');

	const [cancelId, setCancelId] = useState<number | null>(null);
	const [cancelReason, setCancelReason] = useState('');
	const [cancelBusy, setCancelBusy] = useState(false);

	const [expiryId, setExpiryId] = useState<number | null>(null);
	const [expiryDate, setExpiryDate] = useState('');
	const [expiryPermanent, setExpiryPermanent] = useState(false);
	const [expiryBusy, setExpiryBusy] = useState(false);
	const [expiryError, setExpiryError] = useState('');

	const [userResults, setUserResults] = useState<{ id: number; callsign: string | null }[]>([]);

	const [refreshKey, setRefreshKey] = useState(0);
	const searchInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			setError('');
			try {
				const params = new URLSearchParams({ page: String(page) });
				if (tab !== 'all') params.set('type', tab);
				if (query) params.set('q', query);
				const res = await fetch(`/api/admin/sanctions?${params}`);
				const json = await res.json();
				const parsed = parseAdminSanctionsResponse(json);
				if (cancelled) return;
				if (parsed) setData(parsed);
				else setError(ts('loadError'));
			} catch {
				if (!cancelled) setError(ts('loadError'));
			}
		})();
		return () => { cancelled = true; };
	}, [page, tab, query, ts, refreshKey]);

	const refreshSanctions = () => setRefreshKey((k) => k + 1);

	const searchUsers = useCallback(async (q: string) => {
		if (!q.trim()) { setUserResults([]); return; }
		try {
			const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}&page=1`);
			const json = await res.json();
			if (json.users) {
				setUserResults(json.users.map((u: { id: number; current_callsign: string | null }) => ({ id: u.id, callsign: u.current_callsign })));
			}
		} catch { /* ignore */ }
	}, []);

	useEffect(() => {
		const timeout = setTimeout(() => searchUsers(formUserSearch), 300);
		return () => clearTimeout(timeout);
	}, [formUserSearch, searchUsers]);

	const handleCreate = async () => {
		setFormBusy(true);
		setFormError('');
		setFormSuccess('');
		try {
			const durationMinutes = formType === 'strike' ? null : (formPermanent ? null : Number(formDuration) * 24 * 60);
			const res = await fetch('/api/admin/sanctions', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					userId: Number(formUserId),
					type: formType,
					reason: formReason,
					durationMinutes
				})
			});
			const json = await res.json();
			const parsed = parseCreateSanctionResponse(json);
			if (parsed?.success) {
				const msg = json.autoEscalation ? ts('createSuccessWithEscalation') : ts('createSuccess');
				setFormSuccess(msg);
				setShowForm(false);
				setFormUserId('');
				setFormUserSearch('');
				setFormReason('');
				setFormDuration('7');
				setFormPermanent(false);
				refreshSanctions();
			} else {
				setFormError(ts('createError'));
			}
		} catch {
			setFormError(ts('createError'));
		}
		setFormBusy(false);
	};

	const handleCancel = async (sanctionId: number) => {
		setCancelBusy(true);
		try {
			const res = await fetch(`/api/admin/sanctions/${sanctionId}/cancel`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ reason: cancelReason })
			});
			const json = await res.json();
			const parsed = parseCancelSanctionResponse(json);
			if (parsed?.success) {
				setCancelId(null);
				setCancelReason('');
				refreshSanctions();
			}
		} catch { /* ignore */ }
		setCancelBusy(false);
	};

	const handleUpdateExpiry = async (sanctionId: number) => {
		setExpiryError('');
		if (!expiryPermanent && expiryDate) {
			const selected = new Date(expiryDate);
			if (selected <= new Date()) {
				setExpiryError(ts('expiryInPast'));
				return;
			}
		}
		setExpiryBusy(true);
		try {
			const expiresAt = expiryPermanent ? null : (expiryDate ? localInputToUtc(expiryDate) : null);
			const res = await fetch(`/api/admin/sanctions/${sanctionId}/expiry`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ expiresAt })
			});
			const json = await res.json();
			const parsed = parseUpdateExpiryResponse(json);
			if (parsed?.success) {
				setExpiryId(null);
				setExpiryDate('');
				setExpiryPermanent(false);
				refreshSanctions();
			}
		} catch { /* ignore */ }
		setExpiryBusy(false);
	};

	const PAGE_SIZE = 50;

	return (
		<AdminSurface>
			<div className="grid gap-4 grid-cols-1">
				<AdminToolbar
					title={ts('title')}
					countText={data ? ts('count', { count: data.total }) : undefined}
					actions={
						<>
							{TABS.map((t_item) => (
								<AdminTabButton
									key={t_item.key}
									active={tab === t_item.key}
									onClick={() => { setTab(t_item.key); setPage(1); }}
								>
									{ts(t_item.labelKey)}
									{data ? <span className="ml-1 opacity-60">({data.counts[t_item.key === 'all' ? 'all' : t_item.key]})</span> : null}
								</AdminTabButton>
							))}
							<AdminSearchInput
								inputRef={searchInputRef}
								value={query}
								onChange={(e) => { setQuery(e.target.value); setPage(1); }}
								onClear={() => {
									setQuery('');
									setPage(1);
									searchInputRef.current?.focus();
								}}
								placeholder={ts('searchPlaceholder')}
							/>
							<AdminButton variant="primary" onClick={() => setShowForm(!showForm)}>
								{ts('newSanction')}
							</AdminButton>
						</>
					}
				/>

				{formSuccess ? <p className="text-sm text-emerald-300">{formSuccess}</p> : null}

				{showForm ? (
					<div className="grid gap-4 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 sm:p-6">
						<p className="text-lg font-semibold text-neutral-50">{ts('newSanction')}</p>
						<div className="grid gap-3 sm:grid-cols-2">
							<div className="relative">
								<p className="mb-1.5 text-xs font-semibold tracking-wide text-neutral-400">{ts('selectUser')}</p>
								<input
									type="text"
									value={formUserSearch}
									onChange={(e) => { setFormUserSearch(e.target.value); setFormUserId(''); }}
									placeholder={ts('selectUserPlaceholder')}
									className="h-10 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-50 placeholder:text-neutral-500 focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20"
								/>
								{userResults.length > 0 && !formUserId ? (
									<div className="absolute left-0 right-0 z-10 mt-1 max-h-40 overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-950 shadow-lg shadow-black/40">
										{userResults.map((u) => (
											<button
												key={u.id}
												type="button"
												onClick={() => { setFormUserId(String(u.id)); setFormUserSearch(u.callsign ?? `User #${u.id}`); setUserResults([]); }}
												className="block w-full px-3 py-2.5 text-left text-sm text-neutral-300 hover:bg-white/5"
											>
												{u.callsign ?? `User #${u.id}`}
											</button>
										))}
									</div>
								) : null}
							</div>
							<div>
								<p className="mb-1.5 text-xs font-semibold tracking-wide text-neutral-400">{ts('selectType')}</p>
								<select
									value={formType}
									onChange={(e) => setFormType(e.target.value as SanctionType)}
									className="h-10 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-50 focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20"
								>
									<option value="strike">{ts('typeStrike')}</option>
									<option value="site_ban">{ts('typeSiteBan')}</option>
									<option value="server_ban">{ts('typeServerBan')}</option>
								</select>
							</div>
							<div className="sm:col-span-2">
								<p className="mb-1.5 text-xs font-semibold tracking-wide text-neutral-400">{ts('reasonLabel')}</p>
								<textarea
									value={formReason}
									onChange={(e) => setFormReason(e.target.value)}
									placeholder={ts('reasonPlaceholder')}
									rows={2}
									className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-50 placeholder:text-neutral-500 focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20"
								/>
							</div>
							{formType !== 'strike' ? (
								<div className="sm:col-span-2">
									<p className="mb-1.5 text-xs font-semibold tracking-wide text-neutral-400">{ts('durationLabel')}</p>
									<div className="flex flex-wrap items-center gap-3">
										<input
											type="number"
											value={formDuration}
											onChange={(e) => setFormDuration(e.target.value)}
											disabled={formPermanent}
											min="1"
											className="h-10 w-32 rounded-lg border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-50 placeholder:text-neutral-500 focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20 disabled:opacity-50"
										/>
										<span className="text-sm text-neutral-400">{ts('durationDays', { count: Number(formDuration) || 0 })}</span>
										<label className="flex items-center gap-1.5 text-sm text-neutral-300">
											<input type="checkbox" checked={formPermanent} onChange={(e) => setFormPermanent(e.target.checked)} className="accent-[color:var(--accent)]" />
											{ts('durationPermanent')}
										</label>
									</div>
								</div>
							) : null}
						</div>
						{formError ? <p className="text-sm text-red-300">{formError}</p> : null}
						<div className="flex gap-2">
							<AdminButton variant="primary" onClick={handleCreate} disabled={formBusy || !formUserId || !formReason.trim()}>
								{formBusy ? ts('creating') : ts('createAction')}
							</AdminButton>
							<AdminButton variant="secondary" onClick={() => setShowForm(false)}>
								{ta('mailingConfirmDecline')}
							</AdminButton>
						</div>
					</div>
				) : null}

				{error ? <p className="text-sm text-red-300">{error}</p> : null}

				{data === null ? (
					<p className="text-sm text-neutral-300">{ta('loading')}</p>
				) : data.sanctions.length === 0 ? (
					<p className="text-sm text-neutral-300">
						{query.trim() ? ts('noMatches') : ts('noSanctions')}
					</p>
				) : (
					<div className="grid gap-3 grid-cols-1">
						<AdminPagination
							page={data.page}
							totalPages={data.totalPages}
							summary={ta('paginationSummary', {
								from: (data.page - 1) * PAGE_SIZE + 1,
								to: Math.min(data.page * PAGE_SIZE, data.total),
								total: data.total,
								page: data.page,
								pages: data.totalPages
							})}
							previousLabel={ta('paginationPrevious')}
							nextLabel={ta('paginationNext')}
							onPageChange={setPage}
						/>
						{data.sanctions.map((s) => (
							<AdminDisclosure
								key={s.id}
								summaryLeft={
									<>
										<p className="truncate text-base font-semibold text-neutral-50">
											{s.callsign ?? '—'}
										</p>
										<p className="mt-1 truncate text-sm text-neutral-400">
											<TypeBadge type={s.type} t={ts} />
											{s.auto_generated ? (
												<span className="ml-2 text-xs text-neutral-500">({ts('autoGenerated')})</span>
											) : null}
											<span className="mx-2 text-neutral-600" aria-hidden="true">•</span>
											<span>{fmtDate(s.created_at)}</span>
											{s.reason ? (
												<>
													<span className="mx-2 text-neutral-600" aria-hidden="true">•</span>
													<span className="text-neutral-300">{localizeReason(s.reason, ts)}</span>
												</>
											) : null}
										</p>
									</>
								}
								summaryRight={
									<StatusBadge sanction={s} t={ts} />
								}
							>
								<div className="grid gap-3 text-sm">
									<div className="grid gap-3 sm:grid-cols-2">
										<AdminField label={ts('callsign')}>
											<p>{s.callsign ?? '—'}</p>
										</AdminField>
										<AdminField label={ts('selectType')}>
											<div className="flex items-center gap-2">
												<TypeBadge type={s.type} t={ts} />
												{s.auto_generated ? (
													<span className="text-xs text-neutral-500">({ts('autoGenerated')})</span>
												) : null}
											</div>
										</AdminField>
									</div>
									{s.reason ? (
										<AdminField label={ts('reason')}>
											<p>{localizeReason(s.reason, ts)}</p>
										</AdminField>
									) : null}
									<div className="grid gap-3 sm:grid-cols-2">
										<AdminField label={ts('created')}>
											<p>{fmtDate(s.created_at)}</p>
											{s.created_by_callsign ? (
												<p className="text-neutral-400">{ts('createdBy')}: {s.created_by_callsign}</p>
											) : null}
										</AdminField>
										<AdminField label={ts('expires')}>
											<p>{s.expires_at ? fmtDate(s.expires_at) : ts('permanent')}</p>
											{s.original_expires_at ? (
												<p className="text-xs italic text-neutral-500">
													{s.expires_updated_by_callsign
														? ts('expiryChanged', { original: s.original_expires_at ? fmtDate(s.original_expires_at) : ts('permanent'), who: s.expires_updated_by_callsign })
														: ts('expiryChangedNoPrev', { who: '—' })}
												</p>
											) : null}
										</AdminField>
									</div>
									{s.cancelled_at ? (
										<div className="grid gap-3 sm:grid-cols-2">
											<AdminField label={ts('statusCancelled')}>
												<p>{fmtDate(s.cancelled_at)}</p>
												{s.cancelled_by_callsign ? (
													<p className="text-neutral-400">{ts('cancelledBy')}: {s.cancelled_by_callsign}</p>
												) : null}
											</AdminField>
											{s.cancelled_reason ? (
												<AdminField label={ts('cancelReason')}>
													<p>{localizeReason(s.cancelled_reason, ts)}</p>
												</AdminField>
											) : null}
										</div>
									) : null}

									{isActiveSanction(s) ? (
										<>
											<div className="h-px bg-neutral-800" />
											<div className="flex flex-wrap gap-2">
												{cancelId !== s.id ? (
													<AdminButton
														variant="secondary"
														onClick={() => { setCancelId(s.id); setExpiryId(null); }}
													>
														{ts('cancelAction')}
													</AdminButton>
												) : null}
												{expiryId !== s.id ? (
													<AdminButton
														variant="secondary"
														onClick={() => {
															setExpiryId(s.id);
															setCancelId(null);
															setExpiryDate(s.expires_at ? utcToLocalInput(s.expires_at) : '');
															setExpiryPermanent(!s.expires_at);
															setExpiryError('');
														}}
													>
														{ts('changeExpiry')}
													</AdminButton>
												) : null}
											</div>
										</>
									) : null}

									{isActiveSanction(s) && cancelId === s.id ? (
										<div className="grid gap-3 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
											<p className="text-xs font-semibold tracking-wide text-neutral-400">{ts('cancelReasonPlaceholder')}</p>
											<input
												type="text"
												value={cancelReason}
												onChange={(e) => setCancelReason(e.target.value)}
												placeholder={ts('cancelReasonPlaceholder')}
												className="h-10 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-50 placeholder:text-neutral-500 focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20"
											/>
											<div className="flex gap-2">
												<AdminButton variant="primary" onClick={() => handleCancel(s.id)} disabled={cancelBusy || !cancelReason.trim()}>
													{cancelBusy ? ts('cancelling') : ts('cancelAction')}
												</AdminButton>
												<AdminButton variant="secondary" onClick={() => { setCancelId(null); setCancelReason(''); }}>
													{ta('mailingConfirmDecline')}
												</AdminButton>
											</div>
										</div>
									) : null}

									{isActiveSanction(s) && expiryId === s.id ? (
										<div className="grid gap-3 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
											<p className="text-xs font-semibold tracking-wide text-neutral-400">{ts('newExpiry')}</p>
											<div className="flex flex-wrap items-center gap-3">
												<input
													type="datetime-local"
													value={expiryDate}
													min={nowLocalInput()}
													onChange={(e) => { setExpiryDate(e.target.value); setExpiryPermanent(false); setExpiryError(''); }}
													disabled={expiryPermanent}
													style={{ colorScheme: 'dark' }}
													className="h-10 rounded-lg border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-50 focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20 disabled:opacity-50"
												/>
												<label className="flex items-center gap-1.5 text-sm text-neutral-300">
													<input type="checkbox" checked={expiryPermanent} onChange={(e) => { setExpiryPermanent(e.target.checked); if (e.target.checked) setExpiryDate(''); }} className="accent-[color:var(--accent)]" />
													{ts('makePermanent')}
												</label>
											</div>
											{expiryError ? <p className="text-sm text-red-300">{expiryError}</p> : null}
											<div className="flex gap-2">
												<AdminButton variant="primary" onClick={() => handleUpdateExpiry(s.id)} disabled={expiryBusy || (!expiryPermanent && !expiryDate)}>
													{expiryBusy ? ts('updatingExpiry') : ts('updateExpiry')}
												</AdminButton>
												<AdminButton variant="secondary" onClick={() => { setExpiryId(null); setExpiryDate(''); setExpiryPermanent(false); setExpiryError(''); }}>
													{ta('mailingConfirmDecline')}
												</AdminButton>
											</div>
										</div>
									) : null}
								</div>
							</AdminDisclosure>
						))}
					</div>
				)}
			</div>
		</AdminSurface>
	);
}
