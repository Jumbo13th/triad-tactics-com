'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/routing';
import { useParams } from 'next/navigation';
import { parseAdminStatusResponse } from '@/features/admin/domain/api';
import {
	parseAdminBadgesResponse,
	parseAdminUserBadgeMutationResponse,
	parseAdminUsersResponse,
	type AdminUsersView
} from '@/features/admin/domain/api';
import type { AdminBadgeType, AdminUserBadge } from '@/features/admin/domain/types';
import { formatLocalizedDateTime } from '@/platform/dateTime';
import { useViewerDateTimePreferences } from '@/platform/useViewerDateTimePreferences';
import {
	AdminBadge,
	AdminButton,
	AdminDisclosure,
	AdminField,
	AdminGate,
	AdminPagination,
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
	const routeLocale = (params.locale as string) || 'en';
	const locale = useLocale();
	const redirectPath = useMemo(() => buildLocalizedPath(routeLocale, pathname), [routeLocale, pathname]);
	const { timeZone, hourCycle } = useViewerDateTimePreferences();

	const [status, setStatus] = useState<AdminStatus | null>(null);
	const [users, setUsers] = useState<AdminUsersView | null>(null);
	const [usersStatus, setUsersStatus] = useState<'all' | 'rename_required' | 'confirmed'>('all');
	const [query, setQuery] = useState('');
	const [currentPage, setCurrentPage] = useState(1);
	const searchInputRef = useRef<HTMLInputElement | null>(null);
	const [renamingSteamId, setRenamingSteamId] = useState<string | null>(null);
	const [renameError, setRenameError] = useState<string | null>(null);
	const [badgeCatalog, setBadgeCatalog] = useState<AdminBadgeType[]>([]);
	const [badgeCatalogState, setBadgeCatalogState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
	const [badgeSelections, setBadgeSelections] = useState<Record<number, string>>({});
	const [badgeMutationKey, setBadgeMutationKey] = useState<string | null>(null);
	const [badgeError, setBadgeError] = useState<string | null>(null);

	const [debouncedQuery, setDebouncedQuery] = useState('');
	useEffect(() => {
		const handle = window.setTimeout(() => setDebouncedQuery(query), 200);
		return () => window.clearTimeout(handle);
	}, [query]);

	useEffect(() => {
		setCurrentPage(1);
	}, [usersStatus, debouncedQuery]);

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
				setBadgeCatalogState('loading');
				const res = await fetch('/api/admin/badges', { cache: 'no-store' });
				const json: unknown = (await res.json()) as unknown;
				const parsed = parseAdminBadgesResponse(json);
				if (cancelled) return;
				if (!res.ok || !parsed || 'error' in parsed) {
					setBadgeCatalogState('error');
					return;
				}

				setBadgeCatalog(parsed.badges);
				setBadgeCatalogState('ready');
			} catch {
				if (!cancelled) setBadgeCatalogState('error');
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [status]);

	const loadUsers = useMemo(() => {
		return async (opts: { status: 'all' | 'rename_required' | 'confirmed'; q: string; page: number }) => {
			const sp = new URLSearchParams();
			sp.set('status', opts.status);
			sp.set('page', String(opts.page));
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
				const json = await loadUsers({ status: usersStatus, q: debouncedQuery, page: currentPage });
				if (cancelled) return;
				setUsers(json);
				if ('success' in json && json.page !== currentPage) setCurrentPage(json.page);
			} catch {
				if (!cancelled) setUsers({ error: 'server_error' });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [status, usersStatus, currentPage, debouncedQuery, loadUsers]);

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
			const json = await loadUsers({ status: usersStatus, q: debouncedQuery, page: currentPage });
			setUsers(json);
			if ('success' in json && json.page !== currentPage) setCurrentPage(json.page);
		} catch {
			setRenameError('rename_failed');
		} finally {
			setRenamingSteamId(null);
		}
	};

	const replaceUserBadges = (userId: number, badges: AdminUserBadge[]) => {
		setUsers((current) => {
			if (!current || 'error' in current) return current;
			return {
				...current,
				users: current.users.map((user) => (user.id === userId ? { ...user, badges } : user))
			};
		});
	};

	const handleAssignBadge = async (userId: number, directBadgeId?: number) => {
		const badgeTypeId = directBadgeId ?? Number(badgeSelections[userId] ?? '');
		if (!Number.isSafeInteger(badgeTypeId) || badgeTypeId < 1) return;

		try {
			setBadgeError(null);
			setBadgeMutationKey(`assign:${userId}`);
			const res = await fetch(`/api/admin/users/${userId}/badges`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ badgeTypeId })
			});
			const json: unknown = (await res.json()) as unknown;
			const parsed = parseAdminUserBadgeMutationResponse(json);
			if (!res.ok || !parsed || 'error' in parsed) {
				setBadgeError(
					parsed && 'error' in parsed && parsed.error === 'badge_retired'
						? ta('userBadgesAssignRetiredError')
						: ta('userBadgesAssignError')
				);
				return;
			}

			replaceUserBadges(userId, parsed.badges);
			setBadgeSelections((current) => ({ ...current, [userId]: '' }));
		} catch {
			setBadgeError(ta('userBadgesAssignError'));
		} finally {
			setBadgeMutationKey(null);
		}
	};

	const handleRemoveBadge = async (userId: number, badgeTypeId: number) => {
		try {
			setBadgeError(null);
			setBadgeMutationKey(`remove:${userId}:${badgeTypeId}`);
			const res = await fetch(`/api/admin/users/${userId}/badges`, {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ badgeTypeId })
			});
			const json: unknown = (await res.json()) as unknown;
			const parsed = parseAdminUserBadgeMutationResponse(json);
			if (!res.ok || !parsed || 'error' in parsed) {
				setBadgeError(ta('userBadgesRemoveError'));
				return;
			}

			replaceUserBadges(userId, parsed.badges);
		} catch {
			setBadgeError(ta('userBadgesRemoveError'));
		} finally {
			setBadgeMutationKey(null);
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
							{badgeError ? <p className="text-sm text-neutral-300">{badgeError}</p> : null}
							<AdminPagination
								page={users.page}
								totalPages={users.totalPages}
								summary={ta('paginationSummary', {
									from: (users.page - 1) * users.pageSize + 1,
									to: Math.min(users.page * users.pageSize, users.count),
									total: users.count,
									page: users.page,
									pages: users.totalPages
								})}
								previousLabel={ta('paginationPrevious')}
								nextLabel={ta('paginationNext')}
								onPageChange={setCurrentPage}
							/>
							{users.users.map((row, idx) => {
								const key = (row.id ?? idx).toString();
								const steamid64 = row.steamid64 ?? null;
								const callsign = row.current_callsign ?? null;
								const discordId = row.discord_id ?? null;
								const createdAt = formatLocalizedDateTime(row.created_at ?? null, {
									locale,
									timeZone,
									hourCycle,
									dateStyle: 'medium',
									timeStyle: 'short'
								}) ?? row.created_at ?? '';
								const renameRequiredAt = row.rename_required_at ?? null;
								const renameRequiredAtDisplay = formatLocalizedDateTime(renameRequiredAt, {
									locale,
									timeZone,
									hourCycle,
									dateStyle: 'medium',
									timeStyle: 'short'
								}) ?? renameRequiredAt;
								const renameRequiredReason = row.rename_required_reason ?? null;
								const renameRequiredBy = row.rename_required_by_steamid64 ?? null;
								const confirmedAt = row.player_confirmed_at ?? null;
								const confirmedAtDisplay = formatLocalizedDateTime(confirmedAt, {
									locale,
									timeZone,
									hourCycle,
									dateStyle: 'medium',
									timeStyle: 'short'
								}) ?? confirmedAt;
								const hasPendingRename = row.has_pending_rename_request;
								const canRequestRename = !!steamid64 && !!confirmedAt && !renameRequiredAt && !hasPendingRename;
								return (
									<AdminDisclosure
										key={key}
										summaryLeft={
											<>
												<p className="flex items-center gap-2 text-base font-semibold text-neutral-50">
													<span className="truncate">{callsign ?? steamid64 ?? `User #${row.id ?? idx}`}</span>
													{row.unit_tag && row.unit_id && (
														<a
															href={`/en/units/${row.unit_tag}`}
															target="_blank"
															rel="noreferrer"
															onClick={e => e.stopPropagation()}
															className="shrink-0 rounded-lg border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 px-1.5 py-0.5 text-xs font-bold tracking-widest text-[color:var(--accent)] transition hover:bg-[color:var(--accent)]/20"
														>
															{row.unit_tag}
														</a>
													)}
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
											{discordId ? (
												<AdminField label={ta('discordId')}>
													<p>{discordId}</p>
												</AdminField>
											) : null}
											{renameRequiredAt ? (
												<AdminField label={ta('colRenameRequiredAt')}>
													<p>{renameRequiredAtDisplay}</p>
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
													<p>{confirmedAtDisplay}</p>
												</AdminField>
											) : null}
													<AdminField label={ta('userBadgesField')}>
														{badgeCatalogState === 'loading' ? (
															<p className="text-sm text-neutral-400">{ta('loading')}</p>
														) : badgeCatalogState === 'error' ? (
															<p className="text-sm text-neutral-400">{ta('userBadgesCatalogLoadError')}</p>
														) : badgeCatalog.length === 0 ? (
															<p className="text-sm text-neutral-400">{ta('userBadgesNoCatalog')}</p>
														) : (() => {
															const allBadges = badgeCatalog.filter(
																(b) => b.status === 'active' || row.badges.some((a) => a.id === b.id)
															);
															return allBadges.length === 0 ? (
																<p className="text-sm text-neutral-400">{ta('userBadgesNone')}</p>
															) : (
																<div className="grid gap-2 sm:grid-cols-2">
																	{allBadges.map((badge) => {
																		const assigned = row.badges.some((a) => a.id === badge.id);
																		const mutKey = assigned ? `remove:${row.id}:${badge.id}` : `assign:${row.id}`;
																		const isMutating = badgeMutationKey === mutKey;
																		const isRetiredUnassigned = badge.status === 'retired' && !assigned;
																		return (
																			<button
																				key={badge.id}
																				type="button"
																				disabled={badgeMutationKey !== null || isRetiredUnassigned}
																				onClick={() => {
																					if (assigned) {
																						void handleRemoveBadge(row.id, badge.id);
																					} else {
																						setBadgeSelections((c) => ({ ...c, [row.id]: String(badge.id) }));
																						void handleAssignBadge(row.id, badge.id);
																					}
																				}}
																				className={
																					'flex items-center gap-3 rounded-2xl border p-3 text-left text-sm transition-colors disabled:cursor-not-allowed ' +
																					(assigned
																						? 'border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 text-neutral-50'
																						: 'border-neutral-800 bg-neutral-950/60 text-neutral-300 hover:border-neutral-600') +
																					(isRetiredUnassigned ? ' opacity-50' : '')
																				}
																			>
																				<span
																					className={
																						'flex h-4 w-4 shrink-0 items-center justify-center rounded border ' +
																						(assigned
																							? 'border-[color:var(--accent)] bg-[color:var(--accent)] text-neutral-950'
																							: 'border-neutral-600 bg-neutral-900')
																					}
																				>
																					{assigned ? (
																						<svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
																							<path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
																						</svg>
																					) : null}
																				</span>
																				<span className="flex flex-wrap items-center gap-2">
																					<span className="font-semibold">{badge.label}</span>
																					{badge.status === 'retired' ? <AdminBadge>{ta('badgesStatusRetired')}</AdminBadge> : null}
																				</span>
																				{isMutating ? (
																					<span className="ml-auto text-xs text-neutral-400">{ta('userBadgesUpdating')}</span>
																				) : null}
																			</button>
																		);
																	})}
																</div>
															);
														})()}
													</AdminField>
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
