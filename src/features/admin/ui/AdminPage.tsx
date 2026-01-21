'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/routing';
import { useParams } from 'next/navigation';
import {
	parseAdminApplicationsResponse,
	parseAdminStatusResponse,
	type AdminApplicationsView
} from '@/features/admin/domain/api';
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

function buildLocalizedPath(locale: string, pathname: string) {
	const suffix = pathname === '/' ? '' : pathname;
	return `/${locale}${suffix}`;
}

export default function AdminPage() {
	const ta = useTranslations('admin');
	const tf = useTranslations('form');
	const pathname = usePathname();
	const params = useParams();
	const locale = (params.locale as string) || 'en';

	const redirectPath = useMemo(() => buildLocalizedPath(locale, pathname), [locale, pathname]);

	const [status, setStatus] = useState<AdminStatus | null>(null);
	const [apps, setApps] = useState<AdminApplicationsView | null>(null);
	const [appsStatus, setAppsStatus] = useState<'active' | 'archived'>('active');
	const [query, setQuery] = useState('');
	const searchInputRef = useRef<HTMLInputElement | null>(null);
	const [confirmingId, setConfirmingId] = useState<number | null>(null);
	const [confirmError, setConfirmError] = useState<string | null>(null);
	const [confirmRenameId, setConfirmRenameId] = useState<number | null>(null);
	const [confirmRenameError, setConfirmRenameError] = useState<string | null>(null);

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
				const json: unknown = (await res.json()) as unknown;
				const parsed = parseAdminStatusResponse(json);
				if (!cancelled) setStatus(parsed ?? { connected: false, isAdmin: false });
			} catch {
				if (!cancelled) setStatus({ connected: false, isAdmin: false });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const loadApps = useMemo(() => {
		return async (opts: { status: 'active' | 'archived'; q: string }) => {
			const params = new URLSearchParams();
			params.set('status', opts.status);
			if (opts.q.trim()) params.set('q', opts.q.trim());
			const res = await fetch(`/api/admin?${params.toString()}`, { cache: 'no-store' });
			const json: unknown = (await res.json()) as unknown;
			return parseAdminApplicationsResponse(json) ?? { error: 'server_error' };
		};
	}, []);

	useEffect(() => {
		if (!status?.connected || !status.isAdmin) return;
		let cancelled = false;
		(async () => {
			try {
				const json = await loadApps({ status: appsStatus, q: debouncedQuery });
				if (!cancelled) setApps(json);
			} catch {
				if (!cancelled) setApps({ error: 'server_error' });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [status, appsStatus, debouncedQuery, loadApps]);

	const handleConfirm = async (applicationId: number) => {
		try {
			setConfirmError(null);
			setConfirmingId(applicationId);
			const res = await fetch('/api/admin/confirm', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ applicationId })
			});
			if (!res.ok) {
				setConfirmError('confirm_failed');
				return;
			}

			// Refresh current view.
			const json = await loadApps({ status: appsStatus, q: debouncedQuery });
			setApps(json);
		} catch {
			setConfirmError('confirm_failed');
		} finally {
			setConfirmingId(null);
		}
	};

	const handleConfirmWithRename = async (applicationId: number, steamid64: string) => {
		try {
			setConfirmRenameError(null);
			setConfirmRenameId(applicationId);
			const reasonRaw = window.prompt(ta('renameReasonPrompt'));
			const reason = typeof reasonRaw === 'string' ? reasonRaw.trim() : '';
			const res = await fetch('/api/admin/rename-required', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ steamid64, applicationId, reason: reason || null })
			});
			if (!res.ok) {
				setConfirmRenameError('confirm_rename_failed');
				return;
			}

			// Refresh current view.
			const json = await loadApps({ status: appsStatus, q: debouncedQuery });
			setApps(json);
		} catch {
			setConfirmRenameError('confirm_rename_failed');
		} finally {
			setConfirmRenameId(null);
		}
	};

	return (
		<AdminSurface>
			<AdminGate status={status} redirectPath={redirectPath} t={ta}>
				<div className="grid gap-4">
					<AdminToolbar
						title={ta('applicationsTitle')}
						countText={
							apps && 'success' in apps && apps.success ? ta('applicationsCount', { count: apps.count }) : undefined
						}
						actions={
							apps && 'success' in apps && apps.success ? (
								<>
									<AdminTabButton active={appsStatus === 'active'} onClick={() => setAppsStatus('active')}>
										{ta('tabActive')} ({apps.counts.active})
									</AdminTabButton>
									<AdminTabButton
										active={appsStatus === 'archived'}
										onClick={() => setAppsStatus('archived')}
									>
										{ta('tabArchived')} ({apps.counts.archived})
									</AdminTabButton>
									<AdminSearchInput
										inputRef={searchInputRef}
										value={query}
										onChange={(e) => setQuery(e.target.value)}
										onClear={() => {
											setQuery('');
											searchInputRef.current?.focus();
										}}
										placeholder={ta('searchPlaceholder')}
									/>
								</>
							) : null
						}
					/>

						{apps === null ? (
						<p className="text-sm text-neutral-300">{ta('loading')}</p>
					) : 'error' in apps ? (
						<p className="text-sm text-neutral-300">{ta('loadError')}</p>
					) : apps.count === 0 ? (
						<p className="text-sm text-neutral-300">
							{debouncedQuery.trim() ? ta('noMatches') : ta('noApplications')}
						</p>
					) : (
						<div className="grid gap-3">
							{confirmError ? <p className="text-sm text-neutral-300">{ta('confirmError')}</p> : null}
								{confirmRenameError ? (
									<p className="text-sm text-neutral-300">{ta('confirmRenameError')}</p>
								) : null}
							{apps.applications.map((row, idx) => {
								const key = row.id ?? idx;
								const isConfirmed = !!row.confirmed_at;
								return (
									<AdminDisclosure
										key={key}
										summaryLeft={
											<>
												<p className="truncate text-base font-semibold text-neutral-50">
													{row.persona_name ?? row.steamid64}
												</p>
												<p className="mt-1 truncate text-sm text-neutral-400">
													<span>{row.email}</span>
													<span className="mx-2 text-neutral-600" aria-hidden="true">
														•
													</span>
													<span>{row.locale ?? 'en'}</span>
													<span className="mx-2 text-neutral-600" aria-hidden="true">
														•
													</span>
													<span>{row.created_at ?? ''}</span>
												</p>
											</>
										}
											summaryRight={
												isConfirmed ? (
													<AdminBadge>{ta('confirmed')}</AdminBadge>
												) : appsStatus === 'archived' ? null : (
													<>
														<AdminButton
															variant="primary"
															className="h-9 whitespace-nowrap"
															onClick={(e) => {
																e.preventDefault();
																if (row.id) void handleConfirm(row.id);
															}}
															disabled={!row.id || confirmingId === row.id}
														>
															{confirmingId === row.id ? ta('confirming') : ta('confirm')}
														</AdminButton>
														<AdminButton
															variant="secondary"
															className="h-9 whitespace-nowrap"
															onClick={(e) => {
																e.preventDefault();
																if (row.id && row.steamid64) void handleConfirmWithRename(row.id, row.steamid64);
															}}
															disabled={!row.id || !row.steamid64 || confirmRenameId === row.id}
														>
															{confirmRenameId === row.id ? ta('confirmingRename') : ta('confirmAndRename')}
														</AdminButton>
													</>
												)
											}
									>
										<div className="grid gap-3 text-sm">
											<AdminField label={ta('colSteam')}>
												<p>{row.steamid64}</p>
												{row.persona_name ? <p className="text-neutral-400">{row.persona_name}</p> : null}
											</AdminField>

											<AdminField label={tf('email')}>
												<p>{row.email}</p>
											</AdminField>

											<AdminField label={tf('callsign')}>
												<p className="whitespace-pre-wrap">{row.answers?.callsign}</p>
												{row.answers?.name ? (
													<p className="text-xs text-neutral-400">
														{tf('name')}: {row.answers.name}
													</p>
												) : null}
											</AdminField>

											<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
												<AdminField label={tf('age')}>
													<p>{row.answers?.age}</p>
												</AdminField>
												<AdminField label={tf('timezone')}>
													<p>{row.answers?.timezone}</p>
												</AdminField>
											</div>

											<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
												<AdminField label={tf('city')}>
													<p>{row.answers?.city}</p>
												</AdminField>
												<AdminField label={tf('country')}>
													<p>{row.answers?.country}</p>
												</AdminField>
											</div>

											<AdminField label={tf('availability')}>
												<p className="whitespace-pre-wrap">{row.answers?.availability}</p>
											</AdminField>

											<AdminField label={tf('experience')}>
												<p className="whitespace-pre-wrap">{row.answers?.experience}</p>
											</AdminField>

											<AdminField label={tf('motivation')}>
												<p className="whitespace-pre-wrap">{row.answers?.motivation}</p>
											</AdminField>

											{isConfirmed ? (
												<AdminField label={ta('confirmedAt')}>
													<p>{row.confirmed_at}</p>
													{row.confirmed_by_steamid64 ? (
														<p className="text-neutral-400">
															{ta('confirmedBy', { steamid64: row.confirmed_by_steamid64 })}
														</p>
													) : null}
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
