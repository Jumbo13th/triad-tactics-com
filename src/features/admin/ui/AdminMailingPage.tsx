'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/routing';
import { useParams } from 'next/navigation';
import {
	parseAdminApplicationsResponse,
	parseAdminMailingResponse,
	parseAdminStatusResponse,
	parseAdminUsersResponse,
	type AdminStatus
} from '@/features/admin/domain/api';
import { AdminButton, AdminGate, AdminSearchInput, AdminSurface, AdminToolbar } from './root';

function buildLocalizedPath(locale: string, pathname: string) {
	const suffix = pathname === '/' ? '' : pathname;
	return `/${locale}${suffix}`;
}

export default function AdminMailingPage() {
	const ta = useTranslations('admin');
	const pathname = usePathname();
	const params = useParams();
	const locale = (params.locale as string) || 'en';

	const redirectPath = useMemo(() => buildLocalizedPath(locale, pathname), [locale, pathname]);

	const [status, setStatus] = useState<AdminStatus | null>(null);
	const [outboxStatus, setOutboxStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
	const [outboxMessage, setOutboxMessage] = useState<string | null>(null);
	const [subjectEn, setSubjectEn] = useState('');
	const [bodyEn, setBodyEn] = useState('');
	const [subjectRu, setSubjectRu] = useState('');
	const [bodyRu, setBodyRu] = useState('');
	const [approvedStatus, setApprovedStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
	const [approvedRows, setApprovedRows] = useState<
		Array<{
			id: number;
			email: string;
			callsign: string;
			confirmedAt: string | null;
		}>
	>([]);
	const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
	const [query, setQuery] = useState('');
	const [debouncedQuery, setDebouncedQuery] = useState('');
	const searchInputRef = useRef<HTMLInputElement | null>(null);
	const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
	const [sendMessage, setSendMessage] = useState<string | null>(null);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [configStatus, setConfigStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
	const [configValues, setConfigValues] = useState<Array<{ key: string; value: string }>>([]);

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

	useEffect(() => {
		if (!status?.connected || !status.isAdmin) return;
		let cancelled = false;
		(async () => {
			try {
				setApprovedStatus('loading');
				const [appsRes, usersRes] = await Promise.all([
					fetch('/api/admin?status=archived', { cache: 'no-store' }),
					fetch('/api/admin/users?status=confirmed', { cache: 'no-store' })
				]);
				const appsJson: unknown = (await appsRes.json()) as unknown;
				const usersJson: unknown = (await usersRes.json()) as unknown;
				const appsParsed = parseAdminApplicationsResponse(appsJson);
				const usersParsed = parseAdminUsersResponse(usersJson);
				if (!appsParsed || 'error' in appsParsed) throw new Error('load_failed');
				if (!usersParsed || 'error' in usersParsed) throw new Error('load_failed');

				const appById = new Map<number, { email: string; confirmedAt: string | null }>();
				for (const app of appsParsed.applications) {
					if (!app.id) continue;
					if (!app.email?.trim()) continue;
					if (!app.confirmed_at) continue;
					appById.set(app.id, { email: app.email, confirmedAt: app.confirmed_at ?? null });
				}

				const rows = usersParsed.users
					.map((user) => {
						const applicationId = user.confirmed_application_id ?? null;
						if (!applicationId) return null;
						const app = appById.get(applicationId);
						if (!app) return null;
						return {
							id: applicationId,
							email: app.email,
							callsign: user.current_callsign ?? '',
							confirmedAt: app.confirmedAt
						};
					})
					.filter((row): row is { id: number; email: string; callsign: string; confirmedAt: string | null } =>
						!!row
					);
				if (cancelled) return;
				setApprovedRows(rows);
				setApprovedStatus('success');
				setSelectedIds((current) => {
					const next = new Set<number>();
					for (const row of rows) {
						if (current.has(row.id)) next.add(row.id);
					}
					return next;
				});
			} catch {
				if (!cancelled) setApprovedStatus('error');
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [status]);

	const handleRunOutbox = async () => {
		try {
			setOutboxStatus('running');
			setOutboxMessage(null);
			const res = await fetch('/api/admin/outbox', { method: 'POST' });
			if (!res.ok) throw new Error('outbox_failed');
			setOutboxStatus('success');
			setOutboxMessage(ta('outboxRunSuccess'));
		} catch {
			setOutboxStatus('error');
			setOutboxMessage(ta('outboxRunError'));
		}
	};

	const variableExampleParams = useMemo(
		() => ({
			name: 'name',
			callsign: 'callsign',
			websiteUrl: 'websiteUrl'
		}),
		[]
	);

	useEffect(() => {
		const handle = window.setTimeout(() => setDebouncedQuery(query), 200);
		return () => window.clearTimeout(handle);
	}, [query]);

	const filteredRows = useMemo(() => {
		const needle = debouncedQuery.trim().toLowerCase();
		if (!needle) return approvedRows;
		return approvedRows.filter((row) => {
			return [row.callsign, row.email].some((value) => value.toLowerCase().includes(needle));
		});
	}, [approvedRows, debouncedQuery]);

	const allSelected = useMemo(() => {
		if (filteredRows.length === 0) return false;
		return filteredRows.every((row) => selectedIds.has(row.id));
	}, [filteredRows, selectedIds]);

	const selectedCount = selectedIds.size;
	const selectedRows = useMemo(
		() => approvedRows.filter((row) => selectedIds.has(row.id)),
		[approvedRows, selectedIds]
	);

	const loadConfig = async () => {
		try {
			setConfigStatus('loading');
			const res = await fetch('/api/admin/config', { cache: 'no-store' });
			if (!res.ok) throw new Error('config_failed');
			const json: unknown = (await res.json()) as unknown;
			if (!json || typeof json !== 'object' || !('success' in json)) throw new Error('config_invalid');
			const payload = json as { success?: boolean; config?: Array<{ key?: string; value?: string }> };
			if (!payload.success || !Array.isArray(payload.config)) throw new Error('config_invalid');
			const parsed = payload.config
				.map((item) => ({ key: item.key ?? '', value: item.value ?? '' }))
				.filter((item) => item.key.length > 0);
			setConfigValues(parsed);
			setConfigStatus('success');
		} catch {
			setConfigStatus('error');
		}
	};

	const handleOpenConfirm = () => {
		if (!canSend) return;
		setConfirmOpen(true);
		if (configStatus !== 'success') void loadConfig();
	};

	const handleSend = async () => {
		try {
			setSendStatus('sending');
			setSendMessage(null);
			const applicationIds = Array.from(selectedIds);
			const res = await fetch('/api/admin/mailing', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					applicationIds,
					subjectEn,
					bodyEn,
					subjectRu,
					bodyRu
				})
			});
			const json: unknown = (await res.json()) as unknown;
			const parsed = parseAdminMailingResponse(json);
			if (!res.ok || !parsed || 'error' in parsed) throw new Error('mailing_failed');
			setSendStatus('success');
			setSendMessage(
				ta('mailingSendSuccess', {
					queued: parsed.queued,
					total: parsed.total,
					skippedNoEmail: parsed.skippedNoEmail,
					skippedDuplicate: parsed.skippedDuplicate
				})
			);
		} catch {
			setSendStatus('error');
			setSendMessage(ta('mailingSendError'));
		}
	};

	const canSend =
		subjectEn.trim().length > 0 &&
		bodyEn.trim().length > 0 &&
		subjectRu.trim().length > 0 &&
		bodyRu.trim().length > 0 &&
		sendStatus !== 'sending' &&
		selectedIds.size > 0;

	return (
		<AdminSurface>
			<AdminGate status={status} redirectPath={redirectPath} t={ta}>
				<div className="grid gap-6">
					<AdminToolbar title={ta('mailingTitle')} />
					<p className="text-sm text-neutral-300">{ta('mailingSubtitle')}</p>

					<div className="grid gap-6">
						<form
							className="grid gap-6 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 shadow-sm shadow-black/20"
							onSubmit={(e) => {
								e.preventDefault();
								handleOpenConfirm();
							}}
						>
							<div className="grid gap-3">
								<div>
									<p className="text-sm font-medium text-neutral-200">{ta('mailingRecipientsLabel')}</p>
									<p className="mt-1 text-sm leading-relaxed text-neutral-400">
										{ta('mailingRecipientsHelp')}
									</p>
								</div>
								<div className="grid gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
									<div className="flex flex-wrap items-center justify-between gap-3">
										<div>
											<p className="text-sm font-semibold text-neutral-100">
												{ta('mailingRecipientsLabel')}
											</p>
										</div>
										<div className="min-w-[220px]">
											<AdminSearchInput
												inputRef={searchInputRef}
												value={query}
												onChange={(e) => setQuery(e.target.value)}
												onClear={() => setQuery('')}
												placeholder={ta('searchUsersPlaceholder')}
											/>
										</div>
									</div>
									<div className="flex w-full flex-wrap items-center justify-start gap-3">
										<AdminButton
											variant="secondary"
											className="h-8 px-3 text-xs"
											onClick={() => {
												setSelectedIds((current) => {
													if (filteredRows.length === 0) return current;
													const next = new Set<number>(current);
													for (const row of filteredRows) next.add(row.id);
													return next;
											});
											}}
											disabled={allSelected || filteredRows.length === 0}
										>
											{ta('mailingSelectAll')}
										</AdminButton>
										<AdminButton
											variant="secondary"
											className="h-8 px-3 text-xs"
											onClick={() => setSelectedIds(new Set())}
											disabled={selectedIds.size === 0}
										>
											{ta('mailingUnselectAll')}
										</AdminButton>
									</div>
									<div className="max-h-[260px] overflow-auto rounded-xl border border-neutral-800 bg-neutral-950/40">
										{approvedStatus === 'loading' ? (
											<p className="p-3 text-sm text-neutral-400">{ta('mailingLoadingApproved')}</p>
										) : approvedStatus === 'error' ? (
											<p className="p-3 text-sm text-red-300">{ta('mailingApprovedLoadError')}</p>
										) : filteredRows.length === 0 ? (
											<p className="p-3 text-sm text-neutral-400">{ta('mailingNoApproved')}</p>
										) : (
											<ul className="divide-y divide-neutral-800">
												{filteredRows.map((row) => {
													const checked = selectedIds.has(row.id);
													return (
														<li
															key={row.id}
															className="grid grid-cols-[32px_minmax(140px,1.4fr)_minmax(220px,2.6fr)] items-center gap-4 px-4 py-2"
														>
															<input
																type="checkbox"
																checked={checked}
																className="justify-self-start"
																onChange={() => {
																	setSelectedIds((current) => {
																		const next = new Set(current);
																		if (next.has(row.id)) next.delete(row.id);
																		else next.add(row.id);
																		return next;
																});
															}}
														/>
															<p className="truncate text-sm text-neutral-100">
																{row.callsign || ta('mailingCallsignMissing')}
															</p>
															<p className="truncate text-xs text-neutral-400">{row.email}</p>
														</li>
													);
												})}
										</ul>
										)}
									</div>
								<p className="text-xs text-neutral-500">
									{ta('mailingSelectedCount', {
										selected: selectedCount,
										total: filteredRows.length
									})}
								</p>
								</div>
							</div>

							<div className="grid gap-4 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
								<p className="text-xs uppercase tracking-[0.2em] text-neutral-500">{ta('mailingLocaleEn')}</p>
								<label className="grid gap-2 text-sm text-neutral-200">
									<span className="block text-sm font-medium text-neutral-200">
										{ta('mailingSubjectLabel')}
									</span>
									<input
										className="mt-2 block w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-50 placeholder-neutral-500 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20"
										value={subjectEn}
										onChange={(e) => setSubjectEn(e.target.value)}
										placeholder={ta('mailingSubjectPlaceholderEn')}
										required
									/>
								</label>
								<label className="grid gap-2 text-sm text-neutral-200">
									<span className="block text-sm font-medium text-neutral-200">
										{ta('mailingBodyLabel')}
									</span>
									<textarea
										rows={7}
										className="mt-2 block w-full resize-y rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-50 placeholder-neutral-500 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20"
										value={bodyEn}
										onChange={(e) => setBodyEn(e.target.value)}
										placeholder={ta('mailingBodyPlaceholderEn', variableExampleParams)}
										required
									/>
								</label>
								<div className="h-px bg-neutral-800" />
								<p className="text-xs uppercase tracking-[0.2em] text-neutral-500">{ta('mailingLocaleRu')}</p>
								<label className="grid gap-2 text-sm text-neutral-200">
									<span className="block text-sm font-medium text-neutral-200">
										{ta('mailingSubjectLabel')}
									</span>
									<input
										className="mt-2 block w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-50 placeholder-neutral-500 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20"
										value={subjectRu}
										onChange={(e) => setSubjectRu(e.target.value)}
										placeholder={ta('mailingSubjectPlaceholderRu')}
										required
									/>
								</label>
								<label className="grid gap-2 text-sm text-neutral-200">
									<span className="block text-sm font-medium text-neutral-200">
										{ta('mailingBodyLabel')}
									</span>
									<textarea
										rows={7}
										className="mt-2 block w-full resize-y rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-50 placeholder-neutral-500 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20"
										value={bodyRu}
										onChange={(e) => setBodyRu(e.target.value)}
										placeholder={ta('mailingBodyPlaceholderRu', variableExampleParams)}
										required
									/>
								</label>
							</div>

							<div className="flex flex-wrap items-center gap-3">
								<AdminButton
									variant="primary"
									className="h-9"
									disabled={!canSend}
									onClick={(e) => {
										e.preventDefault();
										handleOpenConfirm();
									}}
								>
									{sendStatus === 'sending' ? ta('mailingSending') : ta('mailingSend')}
								</AdminButton>
								{sendStatus === 'error' && sendMessage ? (
									<p className="text-sm text-neutral-300">{sendMessage}</p>
								) : null}
							</div>
						</form>
					</div>

					<div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-sm shadow-black/20">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<p className="text-sm font-semibold text-neutral-100">{ta('outboxTitle')}</p>
								<p className="text-xs text-neutral-400">{ta('outboxHelp')}</p>
							</div>
							<AdminButton
								variant="secondary"
								className="h-9 whitespace-nowrap"
								onClick={(e) => {
									e.preventDefault();
									void handleRunOutbox();
								}}
								disabled={outboxStatus === 'running'}
							>
								{outboxStatus === 'running' ? ta('outboxRunning') : ta('outboxRun')}
							</AdminButton>
						</div>
						{outboxMessage ? <p className="mt-3 text-sm text-neutral-300">{outboxMessage}</p> : null}
					</div>
				</div>
				{confirmOpen && typeof document !== 'undefined'
					? createPortal(
						<div
							className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
							onMouseDown={(e) => {
								if (e.target === e.currentTarget) setConfirmOpen(false);
							}}
						>
									<div
										role="dialog"
										aria-modal="true"
										className="w-full max-w-3xl rounded-2xl border border-neutral-800 bg-neutral-950/95 p-6 shadow-xl"
									>
								<div className="grid gap-4">
									<div>
										<p className="text-lg font-semibold text-neutral-50">{ta('mailingConfirmTitle')}</p>
										<p className="mt-1 text-sm text-neutral-400">{ta('mailingConfirmDescription')}</p>
									</div>
										<div className="grid gap-4">
											<div className="grid gap-2 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
											<p className="text-sm font-semibold text-neutral-100">{ta('mailingConfirmConfigTitle')}</p>
											{configStatus === 'loading' ? (
												<p className="text-xs text-neutral-400">{ta('mailingConfirmConfigLoading')}</p>
											) : configStatus === 'error' ? (
												<p className="text-xs text-red-300">{ta('mailingConfirmConfigError')}</p>
											) : (
													<ul className="text-xs text-neutral-300">
													{configValues.map((item) => (
														<li key={item.key} className="flex items-start justify-between gap-3 border-b border-neutral-900 py-2">
															<span className="text-neutral-400">{item.key}</span>
															<span className="text-right text-neutral-100">{item.value}</span>
														</li>
													))}
												</ul>
											)}
										</div>
										<div className="grid gap-2 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
											<p className="text-sm font-semibold text-neutral-100">{ta('mailingConfirmRecipientsTitle')}</p>
											<p className="text-xs text-neutral-400">
												{ta('mailingSelectedCount', {
													selected: selectedCount,
													total: filteredRows.length
												})}
											</p>
											<ul className="max-h-56 overflow-auto text-xs text-neutral-300">
												{selectedRows.map((row) => (
													<li key={row.id} className="border-b border-neutral-900 py-2">
														<p className="text-neutral-100">{row.callsign || ta('mailingCallsignMissing')}</p>
														<p className="text-neutral-400">{row.email}</p>
													</li>
												))}
											</ul>
										</div>
									</div>
									<div className="flex flex-wrap justify-end gap-3">
										<AdminButton
											variant="secondary"
											onClick={(e) => {
												e.preventDefault();
												setConfirmOpen(false);
											}}
										>
											{ta('mailingConfirmDecline')}
										</AdminButton>
										<AdminButton
											variant="primary"
											disabled={sendStatus === 'sending'}
											onClick={async (e) => {
												e.preventDefault();
												await handleSend();
												setConfirmOpen(false);
											}}
										>
											{ta('mailingConfirmAccept')}
										</AdminButton>
									</div>
								</div>
							</div>
						</div>,
						document.body
					)
					: null}
			</AdminGate>
		</AdminSurface>
	);
}
