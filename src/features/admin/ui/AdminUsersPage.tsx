'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/routing';
import { useParams } from 'next/navigation';
import SteamSignInButton from '@/features/steamAuth/ui/SteamSignInButton';

type AdminStatus =
	| { connected: false; isAdmin: false }
	| { connected: true; isAdmin: boolean; steamid64: string; personaName: string | null; callsign: string | null };

type AdminUsersResponse =
	| {
			success: true;
			count: number;
			counts: { all: number; renameRequired: number; confirmed: number };
			users: Array<Record<string, unknown>>;
	  }
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

export default function AdminUsersPage() {
	const ta = useTranslations('admin');
	const pathname = usePathname();
	const params = useParams();
	const locale = (params.locale as string) || 'en';
	const redirectPath = useMemo(() => buildLocalizedPath(locale, pathname), [locale, pathname]);

	const [status, setStatus] = useState<AdminStatus | null>(null);
	const [users, setUsers] = useState<AdminUsersResponse | null>(null);
	const [usersStatus, setUsersStatus] = useState<'all' | 'rename_required' | 'confirmed'>('all');
	const [query, setQuery] = useState('');
	const searchInputRef = useRef<HTMLInputElement | null>(null);

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

	const loadUsers = useMemo(() => {
		return async (opts: { status: 'all' | 'rename_required' | 'confirmed'; q: string }) => {
			const sp = new URLSearchParams();
			sp.set('status', opts.status);
			if (opts.q.trim()) sp.set('q', opts.q.trim());
			const res = await fetch(`/api/admin/users?${sp.toString()}`, { cache: 'no-store' });
			return (await res.json()) as AdminUsersResponse;
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

	return (
		<section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-8">
			{status === null ? (
				<p className="text-sm text-neutral-300">{ta('loading')}</p>
			) : !status.connected ? (
				<div className="grid gap-4">
					<div>
						<h2 className="text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">
							{ta('loginTitle')}
						</h2>
						<p className="mt-2 text-sm text-neutral-300">{ta('loginText')}</p>
					</div>
					<SteamSignInButton
						redirectPath={redirectPath}
						ariaLabel={ta('signInSteam')}
						size="large"
						className="inline-flex w-fit items-center justify-center rounded-lg focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950"
						imageClassName="h-11 w-auto"
					/>
				</div>
			) : !status.isAdmin ? (
				<div className="grid gap-2">
					<h2 className="text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">
						{ta('forbiddenTitle')}
					</h2>
					<p className="text-sm text-neutral-300">{ta('forbiddenText')}</p>
				</div>
			) : (
				<div className="grid gap-4">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div className="flex flex-wrap items-baseline justify-between gap-2">
							<h2 className="text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">
								{ta('usersTitle')}
							</h2>
							{users && 'success' in users && users.success ? (
								<p className="text-sm text-neutral-400">{ta('usersCount', { count: users.count })}</p>
							) : null}
						</div>

						{users && 'success' in users && users.success ? (
							<div className="flex flex-wrap items-center gap-2">
								<button
									type="button"
									onClick={() => setUsersStatus('all')}
									className={
										'inline-flex items-center rounded-full px-3 py-1.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950 ' +
										(usersStatus === 'all'
											? 'bg-[color:var(--accent)] text-neutral-950'
											: 'bg-white/10 text-neutral-50 hover:bg-white/20')
									}
								>
									{ta('tabAll')} ({users.counts.all})
								</button>
								<button
									type="button"
									onClick={() => setUsersStatus('rename_required')}
									className={
										'inline-flex items-center rounded-full px-3 py-1.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950 ' +
										(usersStatus === 'rename_required'
											? 'bg-[color:var(--accent)] text-neutral-950'
											: 'bg-white/10 text-neutral-50 hover:bg-white/20')
									}
								>
									{ta('tabRenameRequired')} ({users.counts.renameRequired})
								</button>
								<button
									type="button"
									onClick={() => setUsersStatus('confirmed')}
									className={
										'inline-flex items-center rounded-full px-3 py-1.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950 ' +
										(usersStatus === 'confirmed'
											? 'bg-[color:var(--accent)] text-neutral-950'
											: 'bg-white/10 text-neutral-50 hover:bg-white/20')
									}
								>
									{ta('tabConfirmed')} ({users.counts.confirmed})
								</button>

								<div className="relative">
									<input
										ref={searchInputRef}
										type="text"
										value={query}
										onChange={(e) => setQuery(e.target.value)}
										placeholder={ta('searchUsersPlaceholder')}
										className="h-10 w-64 rounded-2xl border border-neutral-800 bg-neutral-950 px-3 pr-10 text-sm text-neutral-100 placeholder:text-neutral-500 shadow-sm shadow-black/20 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950"
									/>
									{query.trim() ? (
										<button
											type="button"
											onClick={() => {
												setQuery('');
												searchInputRef.current?.focus();
											}}
											className="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700 bg-neutral-950 text-neutral-200 shadow-sm shadow-black/30 hover:border-neutral-500 hover:bg-white/5 hover:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950"
											aria-label="Clear"
										>
											<svg
												aria-hidden="true"
												viewBox="0 0 24 24"
												className="h-4 w-4"
												fill="none"
												stroke="currentColor"
												strokeWidth="2.5"
												strokeLinecap="round"
												strokeLinejoin="round"
											>
												<path d="M6 6l12 12" />
												<path d="M18 6L6 18" />
											</svg>
										</button>
									) : null}
								</div>
							</div>
						) : null}
					</div>

					{users === null ? (
						<p className="text-sm text-neutral-300">{ta('loading')}</p>
					) : 'error' in users ? (
						<p className="text-sm text-neutral-300">{ta('loadErrorUsers')}</p>
					) : users.count === 0 ? (
						<p className="text-sm text-neutral-300">{debouncedQuery.trim() ? ta('noMatchesUsers') : ta('noUsers')}</p>
					) : (
						<div className="grid gap-3">
							{users.users.map((row, idx) => {
								const key = (asNumber(row.id) ?? idx).toString();
								const steamid64 = asString(row.steamid64);
								const callsign = asString(row.current_callsign);
								const createdAt = asString(row.created_at) ?? '';
								const renameRequiredAt = asString(row.rename_required_at);
								const renameRequiredReason = asString(row.rename_required_reason);
								const renameRequiredBy = asString(row.rename_required_by_steamid64);
								const confirmedAt = asString(row.player_confirmed_at);
								return (
									<details
										key={key}
										className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-sm shadow-black/20"
									>
										<summary className="flex cursor-pointer list-none flex-col gap-2 [&::-webkit-details-marker]:hidden [&::marker]:hidden sm:flex-row sm:items-center sm:justify-between">
											<div className="min-w-0">
												<p className="truncate text-base font-semibold text-neutral-50">
													{callsign ?? steamid64 ?? `User #${asNumber(row.id) ?? idx}`}
												</p>
												<p className="mt-1 truncate text-sm text-neutral-400">
													<span>{steamid64 ?? ''}</span>
													<span className="mx-2 text-neutral-600" aria-hidden="true">•</span>
													<span>{callsign ?? ''}</span>
													<span className="mx-2 text-neutral-600" aria-hidden="true">•</span>
													<span>{createdAt}</span>
												</p>
											</div>

											<div className="flex shrink-0 items-center gap-2">
												{renameRequiredAt ? (
													<span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-neutral-200">
														{ta('badgeRenameRequired')}
													</span>
												) : null}
												{confirmedAt ? (
													<span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-neutral-200">
														{ta('badgeConfirmed')}
													</span>
												) : null}
												<svg
													viewBox="0 0 20 20"
													fill="currentColor"
													className="h-4 w-4 text-neutral-500"
													aria-hidden="true"
												>
													<path
														fillRule="evenodd"
														d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
														clipRule="evenodd"
													/>
												</svg>
											</div>
										</summary>

										<div className="mt-4 grid gap-3 text-sm">
											<div className="grid gap-2 rounded-xl border border-neutral-900 bg-neutral-950/40 p-3">
												<p className="text-xs font-semibold tracking-wide text-neutral-400">{ta('colSteam')}</p>
												<p className="text-neutral-200">{steamid64 ?? ''}</p>
											</div>
											<div className="grid gap-2 rounded-xl border border-neutral-900 bg-neutral-950/40 p-3">
												<p className="text-xs font-semibold tracking-wide text-neutral-400">{ta('colCallsign')}</p>
												<p className="text-neutral-200">{callsign ?? ''}</p>
											</div>
											{renameRequiredAt ? (
												<div className="grid gap-2 rounded-xl border border-neutral-900 bg-neutral-950/40 p-3">
													<p className="text-xs font-semibold tracking-wide text-neutral-400">{ta('colRenameRequiredAt')}</p>
													<p className="text-neutral-200">{renameRequiredAt}</p>
												</div>
											) : null}
											{renameRequiredReason ? (
												<div className="grid gap-2 rounded-xl border border-neutral-900 bg-neutral-950/40 p-3">
													<p className="text-xs font-semibold tracking-wide text-neutral-400">{ta('colRenameReason')}</p>
													<p className="text-neutral-200">{renameRequiredReason}</p>
												</div>
											) : null}
											{renameRequiredBy ? (
												<div className="grid gap-2 rounded-xl border border-neutral-900 bg-neutral-950/40 p-3">
													<p className="text-xs font-semibold tracking-wide text-neutral-400">{ta('colRenameRequestedBy')}</p>
													<p className="text-neutral-200">{renameRequiredBy}</p>
												</div>
											) : null}
											{confirmedAt ? (
												<div className="grid gap-2 rounded-xl border border-neutral-900 bg-neutral-950/40 p-3">
													<p className="text-xs font-semibold tracking-wide text-neutral-400">{ta('colConfirmedAt')}</p>
													<p className="text-neutral-200">{confirmedAt}</p>
												</div>
											) : null}
										</div>
									</details>
								);
							})}
						</div>
					)}
				</div>
			)}
		</section>
	);
}
