'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/routing';
import { useParams } from 'next/navigation';
import { parseAdminStatusResponse } from '@/features/admin/domain/api';
import { parseAdminUsersResponse, type AdminUsersView } from '@/features/admin/domain/api';
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

export default function AdminUsersPage() {
	const ta = useTranslations('admin');
	const pathname = usePathname();
	const params = useParams();
	const locale = (params.locale as string) || 'en';
	const redirectPath = useMemo(() => buildLocalizedPath(locale, pathname), [locale, pathname]);

	const [status, setStatus] = useState<AdminStatus | null>(null);
	const [users, setUsers] = useState<AdminUsersView | null>(null);
	const [usersStatus, setUsersStatus] = useState<'all' | 'rename_required' | 'confirmed'>('all');
	const [query, setQuery] = useState('');
	const searchInputRef = useRef<HTMLInputElement | null>(null);
	const [renamingSteamId, setRenamingSteamId] = useState<string | null>(null);
	const [renameError, setRenameError] = useState<string | null>(null);

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

	const loadUsers = useMemo(() => {
		return async (opts: { status: 'all' | 'rename_required' | 'confirmed'; q: string }) => {
			const sp = new URLSearchParams();
			sp.set('status', opts.status);
			if (opts.q.trim()) sp.set('q', opts.q.trim());
			const res = await fetch(`/api/admin/users?${sp.toString()}`, { cache: 'no-store' });
			const json: unknown = (await res.json()) as unknown;
			return parseAdminUsersResponse(json) ?? { error: 'server_error' };
		};
	}, []);

	useEffect(() => {
		if (!status?.connected || !status.isAdmin) return;
		let cancelled = false;
		(async () => {
			try {
				const json = await loadUsers({ status: usersStatus, q: debouncedQuery });
				if (!cancelled) setUsers(json);
			} catch {
				if (!cancelled) setUsers({ error: 'server_error' });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [status, usersStatus, debouncedQuery, loadUsers]);

	const handleRequestRename = async (steamid64: string) => {
		try {
			setRenameError(null);
			setRenamingSteamId(steamid64);
			const reasonRaw = window.prompt(ta('renameReasonPrompt'));
			const reason = typeof reasonRaw === 'string' ? reasonRaw.trim() : '';
			const res = await fetch('/api/admin/rename-required', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ steamid64, reason: reason || null })
			});
			if (!res.ok) {
				setRenameError('rename_failed');
				return;
			}

			// Refresh current view.
			const json = await loadUsers({ status: usersStatus, q: debouncedQuery });
			setUsers(json);
		} catch {
			setRenameError('rename_failed');
		} finally {
			setRenamingSteamId(null);
		}
	};

	return (
		<AdminSurface>
			<AdminGate status={status} redirectPath={redirectPath} t={ta}>
				<div className="grid gap-4 grid-cols-1">
					<AdminToolbar
						title={ta('usersTitle')}
						countText={
							users && 'success' in users && users.success ? ta('usersCount', { count: users.count }) : undefined
						}
						actions={
							users && 'success' in users && users.success ? (
								<>
									<AdminTabButton active={usersStatus === 'all'} onClick={() => setUsersStatus('all')}>
										{ta('tabAll')} ({users.counts.all})
									</AdminTabButton>
									<AdminTabButton
										active={usersStatus === 'rename_required'}
										onClick={() => setUsersStatus('rename_required')}
									>
										{ta('tabRenameRequired')} ({users.counts.renameRequired})
									</AdminTabButton>
									<AdminTabButton active={usersStatus === 'confirmed'} onClick={() => setUsersStatus('confirmed')}>
										{ta('tabConfirmed')} ({users.counts.confirmed})
									</AdminTabButton>
									<AdminSearchInput
										inputRef={searchInputRef}
										value={query}
										onChange={(e) => setQuery(e.target.value)}
										onClear={() => {
											setQuery('');
											searchInputRef.current?.focus();
										}}
										placeholder={ta('searchUsersPlaceholder')}
									/>
								</>
							) : null
						}
					/>

					{users === null ? (
						<p className="text-sm text-neutral-300">{ta('loading')}</p>
					) : 'error' in users ? (
						<p className="text-sm text-neutral-300">{ta('loadErrorUsers')}</p>
					) : users.count === 0 ? (
						<p className="text-sm text-neutral-300">
							{debouncedQuery.trim() ? ta('noMatchesUsers') : ta('noUsers')}
						</p>
					) : (
						<div className="grid gap-3 grid-cols-1">
							{renameError ? <p className="text-sm text-neutral-300">{ta('renameError')}</p> : null}
							{users.users.map((row, idx) => {
								const key = (row.id ?? idx).toString();
								const steamid64 = row.steamid64 ?? null;
								const callsign = row.current_callsign ?? null;
								const createdAt = row.created_at ?? '';
								const renameRequiredAt = row.rename_required_at ?? null;
								const renameRequiredReason = row.rename_required_reason ?? null;
								const renameRequiredBy = row.rename_required_by_steamid64 ?? null;
								const confirmedAt = row.player_confirmed_at ?? null;
								const hasPendingRename = row.has_pending_rename_request;
								const canRequestRename = !!steamid64 && !!confirmedAt && !renameRequiredAt && !hasPendingRename;
								return (
									<AdminDisclosure
										key={key}
										summaryLeft={
											<>
												<p className="truncate text-base font-semibold text-neutral-50">
													{callsign ?? steamid64 ?? `User #${row.id ?? idx}`}
												</p>
												<p className="mt-1 truncate text-sm text-neutral-400">
													<span>{steamid64 ?? ''}</span>
													<span className="mx-2 text-neutral-600" aria-hidden="true">
														•
													</span>
													<span>{callsign ?? ''}</span>
													<span className="mx-2 text-neutral-600" aria-hidden="true">
														•
													</span>
													<span>{createdAt}</span>
												</p>
											</>
										}
										summaryRight={
											<>
												{canRequestRename ? (
													<AdminButton
														variant="secondary"
														onClick={(e) => {
														e.preventDefault();
														if (steamid64) void handleRequestRename(steamid64);
													}}
														disabled={renamingSteamId === steamid64}
													>
														{renamingSteamId === steamid64 ? ta('requestingRename') : ta('requestRename')}
													</AdminButton>
												) : null}
												{renameRequiredAt ? <AdminBadge>{ta('badgeRenameRequired')}</AdminBadge> : null}
												{confirmedAt ? <AdminBadge>{ta('badgeConfirmed')}</AdminBadge> : null}
											</>
										}
									>
										<div className="grid gap-3 text-sm">
											<AdminField label={ta('colSteam')}>
												<p>{steamid64 ?? ''}</p>
											</AdminField>
											<AdminField label={ta('colCallsign')}>
												<p>{callsign ?? ''}</p>
											</AdminField>
											{renameRequiredAt ? (
												<AdminField label={ta('colRenameRequiredAt')}>
													<p>{renameRequiredAt}</p>
												</AdminField>
											) : null}
											{renameRequiredReason ? (
												<AdminField label={ta('colRenameReason')}>
													<p>{renameRequiredReason}</p>
												</AdminField>
											) : null}
											{renameRequiredBy ? (
												<AdminField label={ta('colRenameRequestedBy')}>
													<p>{renameRequiredBy}</p>
												</AdminField>
											) : null}
											{confirmedAt ? (
												<AdminField label={ta('colConfirmedAt')}>
													<p>{confirmedAt}</p>
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
