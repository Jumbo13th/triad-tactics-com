'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/routing';
import { useParams } from 'next/navigation';
import type { Application } from '@/platform/db';
import SiteHeader from '@/features/appShell/ui/SiteHeader';
import SteamSignInButton from '@/features/steamAuth/ui/SteamSignInButton';

type AdminStatus =
	| { connected: false; isAdmin: false }
	| { connected: true; isAdmin: boolean; steamid64: string; personaName: string | null };

type AdminApplicationsResponse =
	| {
			success: true;
			count: number;
			counts: { active: number; archived: number; total: number };
			applications: Application[];
		}
	| { error: string };

function buildLocalizedPath(locale: string, pathname: string) {
	const suffix = pathname === '/' ? '' : pathname;
	return `/${locale}${suffix}`;
}

export default function AdminPage() {
	const t = useTranslations('app');
	const tw = useTranslations('welcome');
	const ta = useTranslations('admin');
	const tf = useTranslations('form');
	const pathname = usePathname();
	const params = useParams();
	const locale = (params.locale as string) || 'en';

	const redirectPath = useMemo(() => buildLocalizedPath(locale, pathname), [locale, pathname]);

	const [status, setStatus] = useState<AdminStatus | null>(null);
	const [apps, setApps] = useState<AdminApplicationsResponse | null>(null);
	const [appsStatus, setAppsStatus] = useState<'active' | 'archived'>('active');
	const [query, setQuery] = useState('');
	const [confirmingId, setConfirmingId] = useState<number | null>(null);
	const [confirmError, setConfirmError] = useState<string | null>(null);

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

	const loadApps = useMemo(() => {
		return async (opts: { status: 'active' | 'archived'; q: string }) => {
			const params = new URLSearchParams();
			params.set('status', opts.status);
			if (opts.q.trim()) params.set('q', opts.q.trim());
			const res = await fetch(`/api/admin?${params.toString()}`, { cache: 'no-store' });
			return (await res.json()) as AdminApplicationsResponse;
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

	return (
		<main className="min-h-screen bg-neutral-950">
			<div className="mx-auto max-w-4xl px-4 pt-6 pb-10 sm:pt-8 sm:pb-14">
				<SiteHeader
					homeAriaLabel={t('title')}
					title={t('title')}
					subtitle={ta('subtitle')}
					primaryAction={{ href: '/apply', label: tw('applyButtonShort') }}
				/>

				<section className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-8">
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
										{ta('applicationsTitle')}
									</h2>
									{apps && 'success' in apps && apps.success ? (
										<p className="text-sm text-neutral-400">
											{ta('applicationsCount', { count: apps.count })}
										</p>
									) : null}
								</div>

								{apps && 'success' in apps && apps.success ? (
									<div className="flex flex-wrap items-center gap-2">
										<button
											type="button"
											onClick={() => setAppsStatus('active')}
											className={
												'inline-flex items-center rounded-full px-3 py-1.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950 ' +
												(appsStatus === 'active'
													? 'bg-[color:var(--accent)] text-neutral-950'
													: 'bg-white/10 text-neutral-50 hover:bg-white/20')
											}
										>
											{ta('tabActive')} ({apps.counts.active})
										</button>
										<button
											type="button"
											onClick={() => setAppsStatus('archived')}
											className={
												'inline-flex items-center rounded-full px-3 py-1.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950 ' +
												(appsStatus === 'archived'
													? 'bg-[color:var(--accent)] text-neutral-950'
													: 'bg-white/10 text-neutral-50 hover:bg-white/20')
											}
										>
											{ta('tabArchived')} ({apps.counts.archived})
										</button>
										<div className="relative">
											<input
												type="search"
												value={query}
												onChange={(e) => setQuery(e.target.value)}
												placeholder={ta('searchPlaceholder')}
												className="h-10 w-64 rounded-2xl border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 placeholder:text-neutral-500 shadow-sm shadow-black/20 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950"
											/>
										</div>
									</div>
								) : null}
							</div>

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
									{confirmError ? (
										<p className="text-sm text-neutral-300">{ta('confirmError')}</p>
									) : null}

									{apps.applications.map((row, idx) => {
										const key = row.id ?? idx;
										const isConfirmed = !!row.confirmed_at;
										return (
											<details
												key={key}
												className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-sm shadow-black/20"
											>
												<summary className="flex cursor-pointer list-none flex-col gap-2 [&::-webkit-details-marker]:hidden [&::marker]:hidden sm:flex-row sm:items-center sm:justify-between">
													<div className="min-w-0">
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
													</div>

													<div className="flex shrink-0 items-center gap-2">
														{isConfirmed ? (
															<span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-neutral-200">
																{ta('confirmed')}
															</span>
														) : appsStatus === 'archived' ? null : (
															<button
																type="button"
																onClick={(e) => {
																	e.preventDefault();
																	if (row.id) void handleConfirm(row.id);
																}}
																disabled={!row.id || confirmingId === row.id}
																className="inline-flex items-center justify-center rounded-xl bg-[color:var(--accent)] px-3 py-2 text-sm font-semibold text-neutral-950 shadow-sm shadow-black/30 hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950 disabled:opacity-60"
															>
																{confirmingId === row.id ? ta('confirming') : ta('confirm')}
															</button>
														)}

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
														<p className="text-neutral-200">{row.steamid64}</p>
														{row.persona_name ? <p className="text-neutral-400">{row.persona_name}</p> : null}
													</div>

													<div className="grid gap-2 rounded-xl border border-neutral-900 bg-neutral-950/40 p-3">
														<p className="text-xs font-semibold tracking-wide text-neutral-400">{tf('email')}</p>
														<p className="text-neutral-200">{row.email}</p>
													</div>

													<div className="grid gap-2 rounded-xl border border-neutral-900 bg-neutral-950/40 p-3">
														<p className="text-xs font-semibold tracking-wide text-neutral-400">{tf('name')}</p>
														<p className="whitespace-pre-wrap text-neutral-200">{row.answers?.name}</p>
													</div>

													<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
														<div className="grid gap-2 rounded-xl border border-neutral-900 bg-neutral-950/40 p-3">
															<p className="text-xs font-semibold tracking-wide text-neutral-400">{tf('age')}</p>
															<p className="text-neutral-200">{row.answers?.age}</p>
														</div>
														<div className="grid gap-2 rounded-xl border border-neutral-900 bg-neutral-950/40 p-3">
															<p className="text-xs font-semibold tracking-wide text-neutral-400">{tf('timezone')}</p>
															<p className="text-neutral-200">{row.answers?.timezone}</p>
														</div>
													</div>

													<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
														<div className="grid gap-2 rounded-xl border border-neutral-900 bg-neutral-950/40 p-3">
															<p className="text-xs font-semibold tracking-wide text-neutral-400">{tf('city')}</p>
															<p className="text-neutral-200">{row.answers?.city}</p>
														</div>
														<div className="grid gap-2 rounded-xl border border-neutral-900 bg-neutral-950/40 p-3">
															<p className="text-xs font-semibold tracking-wide text-neutral-400">{tf('country')}</p>
															<p className="text-neutral-200">{row.answers?.country}</p>
														</div>
													</div>

													<div className="grid gap-2 rounded-xl border border-neutral-900 bg-neutral-950/40 p-3">
														<p className="text-xs font-semibold tracking-wide text-neutral-400">{tf('availability')}</p>
														<p className="whitespace-pre-wrap text-neutral-200">{row.answers?.availability}</p>
													</div>

													<div className="grid gap-2 rounded-xl border border-neutral-900 bg-neutral-950/40 p-3">
														<p className="text-xs font-semibold tracking-wide text-neutral-400">{tf('experience')}</p>
														<p className="whitespace-pre-wrap text-neutral-200">{row.answers?.experience}</p>
													</div>

													<div className="grid gap-2 rounded-xl border border-neutral-900 bg-neutral-950/40 p-3">
														<p className="text-xs font-semibold tracking-wide text-neutral-400">{tf('motivation')}</p>
														<p className="whitespace-pre-wrap text-neutral-200">{row.answers?.motivation}</p>
													</div>

													{isConfirmed ? (
														<div className="grid gap-2 rounded-xl border border-neutral-900 bg-neutral-950/40 p-3">
															<p className="text-xs font-semibold tracking-wide text-neutral-400">{ta('confirmedAt')}</p>
															<p className="text-neutral-200">{row.confirmed_at}</p>
															{row.confirmed_by_steamid64 ? (
																<p className="text-neutral-400">{ta('confirmedBy', { steamid64: row.confirmed_by_steamid64 })}</p>
															) : null}
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

				<footer className="mt-10 border-t border-neutral-900 pt-6 text-sm text-neutral-500">
					<p>&copy; 2026 Triad Tactics</p>
				</footer>
			</div>
		</main>
	);
}
