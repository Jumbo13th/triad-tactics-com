'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/routing';
import { useParams } from 'next/navigation';
import {
	AdminBadge,
	AdminButton,
	AdminDisclosure,
	AdminField,
	AdminGate,
	AdminSearchInput,
	AdminSurface,
	AdminTabButton,
	AdminToolbar,
	type AdminStatus
} from './root';

type AdminRenameRequestsResponse =
	| { success: true; count: number; renameRequests: Array<Record<string, unknown>> }
	| { error: string };

function buildLocalizedPath(locale: string, pathname: string) {
	const suffix = pathname === '/' ? '' : pathname;
	return `/${locale}${suffix}`;
}

function asString(v: unknown) {
	return typeof v === 'string' ? v : null;
}

function asNumber(v: unknown) {
	return typeof v === 'number' ? v : Number.isFinite(Number(v)) ? Number(v) : null;
}

export default function AdminRenameRequestsPage() {
	const ta = useTranslations('admin');
	const pathname = usePathname();
	const params = useParams();
	const locale = (params.locale as string) || 'en';
	const redirectPath = useMemo(() => buildLocalizedPath(locale, pathname), [locale, pathname]);

	const [status, setStatus] = useState<AdminStatus | null>(null);
	const [rows, setRows] = useState<AdminRenameRequestsResponse | null>(null);
	const [tab, setTab] = useState<'pending' | 'approved' | 'declined' | 'all'>('pending');
	const [query, setQuery] = useState('');
	const searchInputRef = useRef<HTMLInputElement | null>(null);
	const [decidingId, setDecidingId] = useState<number | null>(null);
	const [decisionError, setDecisionError] = useState<string | null>(null);

	const [debouncedQuery, setDebouncedQuery] = useState('');
	useEffect(() => {
		const handle = window.setTimeout(() => setDebouncedQuery(query), 200);
		return () => window.clearTimeout(handle);
	}, [query]);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch('/api/admin/status', { cache: 'no-store' });
				const json = (await res.json()) as AdminStatus;
				if (!cancelled) setStatus(json);
			} catch {
				if (!cancelled) setStatus({ connected: false, isAdmin: false });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const load = useMemo(() => {
		return async (opts: { status: 'pending' | 'approved' | 'declined' | 'all'; q: string }) => {
			const sp = new URLSearchParams();
			sp.set('status', opts.status);
			if (opts.q.trim()) sp.set('q', opts.q.trim());
			const res = await fetch(`/api/admin/rename-requests?${sp.toString()}`, { cache: 'no-store' });
			return (await res.json()) as AdminRenameRequestsResponse;
		};
	}, []);

	useEffect(() => {
		if (!status?.connected || !status.isAdmin) return;
		let cancelled = false;
		(async () => {
			try {
				const json = await load({ status: tab, q: debouncedQuery });
				if (!cancelled) setRows(json);
			} catch {
				if (!cancelled) setRows({ error: 'server_error' });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [status, tab, debouncedQuery, load]);

	const decide = async (requestId: number, decision: 'approve' | 'decline') => {
		try {
			setDecisionError(null);
			setDecidingId(requestId);
			const declineReason =
				decision === 'decline'
					? (window.prompt(ta('declinePrompt')) ?? '').trim() || null
					: null;
			const res = await fetch('/api/admin/rename-requests/decide', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ requestId, decision, declineReason })
			});
			if (!res.ok) {
				setDecisionError('decision_failed');
				return;
			}
			const json = await load({ status: tab, q: debouncedQuery });
			setRows(json);
		} catch {
			setDecisionError('decision_failed');
		} finally {
			setDecidingId(null);
		}
	};

	return (
		<AdminSurface>
			<AdminGate status={status} redirectPath={redirectPath} t={ta}>
				<div className="grid gap-4">
					<AdminToolbar
						title={ta('renameRequestsTitle')}
						countText={
							rows && 'success' in rows && rows.success ? ta('renameRequestsCount', { count: rows.count }) : undefined
						}
						actions={
							rows && 'success' in rows && rows.success ? (
								<>
									<AdminTabButton active={tab === 'pending'} onClick={() => setTab('pending')}>
										{ta('tabPending')}
									</AdminTabButton>
									<AdminTabButton active={tab === 'approved'} onClick={() => setTab('approved')}>
										{ta('tabApproved')}
									</AdminTabButton>
									<AdminTabButton active={tab === 'declined'} onClick={() => setTab('declined')}>
										{ta('tabDeclined')}
									</AdminTabButton>
									<AdminTabButton active={tab === 'all'} onClick={() => setTab('all')}>
										{ta('tabAll')}
									</AdminTabButton>
									<AdminSearchInput
										inputRef={searchInputRef}
										value={query}
										onChange={(e) => setQuery(e.target.value)}
										onClear={() => {
											setQuery('');
											searchInputRef.current?.focus();
										}}
										placeholder={ta('searchRenameRequestsPlaceholder')}
									/>
								</>
							) : null
						}
					/>

					{decisionError ? <p className="text-sm text-neutral-300">{ta('renameDecisionError')}</p> : null}

					{rows === null ? (
						<p className="text-sm text-neutral-300">{ta('loading')}</p>
					) : 'error' in rows ? (
						<p className="text-sm text-neutral-300">{ta('loadErrorRenameRequests')}</p>
					) : rows.count === 0 ? (
						<p className="text-sm text-neutral-300">
							{debouncedQuery.trim() ? ta('noMatchesRenameRequests') : ta('noRenameRequests')}
						</p>
					) : (
						<div className="grid gap-3">
							{rows.renameRequests.map((row, idx) => {
								const key = (asNumber(row.id) ?? idx).toString();
								const steamid64 = asString(row.steamid64);
								const oldCallsign = asString(row.old_callsign) ?? '';
								const newCallsign = asString(row.new_callsign) ?? '';
								const createdAt = asString(row.created_at) ?? '';
								const status = (asString(row.status) ?? 'pending') as 'pending' | 'approved' | 'declined';
								const requestId = asNumber(row.id) ?? 0;
								const statusLabel =
									status === 'pending'
										? ta('badgePending')
										: status === 'approved'
											? ta('badgeApproved')
											: ta('badgeDeclined');
								return (
									<AdminDisclosure
										key={key}
										summaryLeft={
											<>
												<p className="truncate text-base font-semibold text-neutral-50">
													{steamid64 ?? oldCallsign ?? ta('renameRequestRowTitle')}
												</p>
												<p className="mt-1 truncate text-sm text-neutral-400">
													<span>{oldCallsign}</span>
													<span className="mx-2 text-neutral-600" aria-hidden="true">
														→
													</span>
													<span>{newCallsign}</span>
													<span className="mx-2 text-neutral-600" aria-hidden="true">
														•
													</span>
													<span>{createdAt}</span>
												</p>
											</>
										}
										summaryRight={
											<>
												<AdminBadge>{statusLabel}</AdminBadge>
												{status === 'pending' ? (
													<>
														<AdminButton
															variant="primary"
															onClick={(e) => {
															e.preventDefault();
															if (!requestId) return;
															void decide(requestId, 'approve');
														}}
															disabled={!requestId || decidingId === requestId}
														>
															{decidingId === requestId ? ta('deciding') : ta('approve')}
														</AdminButton>
														<AdminButton
															variant="secondary"
															onClick={(e) => {
															e.preventDefault();
															if (!requestId) return;
															void decide(requestId, 'decline');
														}}
															disabled={!requestId || decidingId === requestId}
														>
															{decidingId === requestId ? ta('deciding') : ta('decline')}
														</AdminButton>
													</>
												) : null}
											</>
										}
									>
										<div className="grid gap-3 text-sm">
											<AdminField label={ta('colSteam')}>
												<p>{steamid64 ?? ''}</p>
											</AdminField>
											<AdminField label={ta('colRename')}>
												<p>
													{oldCallsign} → {newCallsign}
												</p>
											</AdminField>
											{asString(row.decline_reason) ? (
												<AdminField label={ta('colDeclineReason')}>
													<p>{asString(row.decline_reason)}</p>
												</AdminField>
											) : null}
										</div>
									</AdminDisclosure>
								);
							})}
						</div>
					)}
				</div>
			</AdminGate>
		</AdminSurface>
	);
}
