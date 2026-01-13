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
	| { success: true; count: number; applications: Application[] }
	| { error: string };

function buildLocalizedPath(locale: string, pathname: string) {
	const suffix = pathname === '/' ? '' : pathname;
	return `/${locale}${suffix}`;
}

export default function AdminPage() {
	const t = useTranslations('app');
	const tw = useTranslations('welcome');
	const ta = useTranslations('admin');
	const pathname = usePathname();
	const params = useParams();
	const locale = (params.locale as string) || 'en';

	const redirectPath = useMemo(() => buildLocalizedPath(locale, pathname), [locale, pathname]);

	const [status, setStatus] = useState<AdminStatus | null>(null);
	const [apps, setApps] = useState<AdminApplicationsResponse | null>(null);

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

	useEffect(() => {
		if (!status?.connected || !status.isAdmin) return;
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch('/api/admin', { cache: 'no-store' });
				const json = (await res.json()) as AdminApplicationsResponse;
				if (!cancelled) setApps(json);
			} catch {
				if (!cancelled) setApps({ error: 'server_error' });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [status]);

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
							<div className="flex flex-wrap items-baseline justify-between gap-2">
								<h2 className="text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">
									{ta('applicationsTitle')}
								</h2>
								{apps && 'success' in apps && apps.success ? (
									<p className="text-sm text-neutral-400">{ta('applicationsCount', { count: apps.count })}</p>
								) : null}
							</div>

							{apps === null ? (
								<p className="text-sm text-neutral-300">{ta('loading')}</p>
							) : 'error' in apps ? (
								<p className="text-sm text-neutral-300">{ta('loadError')}</p>
							) : apps.count === 0 ? (
								<p className="text-sm text-neutral-300">{ta('noApplications')}</p>
							) : (
								<div className="overflow-x-auto rounded-xl border border-neutral-900">
									<table className="min-w-full divide-y divide-neutral-900">
										<thead className="bg-neutral-950">
											<tr className="text-left text-xs font-semibold tracking-wide text-neutral-400">
												<th className="px-4 py-3">{ta('colSteam')}</th>
												<th className="px-4 py-3">{ta('colEmail')}</th>
												<th className="px-4 py-3">{ta('colLocale')}</th>
												<th className="px-4 py-3">{ta('colCreated')}</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-neutral-900">
											{apps.applications.map((row, idx) => (
												<tr key={row.id ?? idx} className="text-sm text-neutral-200">
													<td className="px-4 py-3 text-neutral-300">{row.persona_name ?? row.steamid64}</td>
													<td className="px-4 py-3 text-neutral-300">{row.email}</td>
													<td className="px-4 py-3 text-neutral-300">{row.locale ?? 'en'}</td>
													<td className="px-4 py-3 text-neutral-300">{row.created_at ?? ''}</td>
												</tr>
											))}
										</tbody>
									</table>
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
