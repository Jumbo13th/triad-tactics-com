'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, Link } from '@/i18n/routing';
import { LanguageSwitcher } from '@/features/language/ui/root';
import { useCurrentGameSummary } from '@/features/games/ui/useCurrentGameSummary';
import { useAdminStatus } from '@/features/steamAuth/ui/root';
import { useUserStatus } from '@/features/users/ui/useUserStatus';
import { DropdownMenuPanel } from '@/features/appShell/ui/root';
import { isConfirmedByAccessLevel } from '@/features/users/domain/api';

function isActivePath(currentPathname: string, href: string) {
	if (href === '/') return currentPathname === '/';
	return currentPathname === href || currentPathname.startsWith(`${href}/`);
}

function isActiveGamesDropdown(pathname: string) {
	return pathname.startsWith('/games') || pathname.startsWith('/sanctions');
}

function getActiveAdminHref(pathname: string) {
	// pathname comes without locale prefix
	if (pathname.startsWith('/admin/users')) return '/admin/users';
	if (pathname.startsWith('/admin/badges')) return '/admin/badges';
	if (pathname.startsWith('/admin/rename-requests')) return '/admin/rename-requests';
	if (pathname.startsWith('/admin/mailing')) return '/admin/mailing';
	if (pathname.startsWith('/admin/games')) return '/admin/games';
	if (pathname.startsWith('/admin/units')) return '/admin/units';
	if (pathname.startsWith('/admin/sanctions')) return '/admin/sanctions';
	return '/admin';
}

type SiteNavItem = {
	href: string;
	label: string;
	badge?: string | null;
};

export default function SiteNavBar() {
	const t = useTranslations('nav');
	const ta = useTranslations('admin');
	const pathname = usePathname();
	const status = useAdminStatus();
	const steamStatus = useUserStatus();
	const adminMenuRef = useRef<HTMLDetailsElement>(null);
	const gamesMenuRef = useRef<HTMLDetailsElement>(null);
	const isAuthorized =
		steamStatus?.connected === true && isConfirmedByAccessLevel(steamStatus.accessLevel);
	const currentGame = useCurrentGameSummary(isAuthorized);

	useEffect(() => {
		// Close the dropdowns when navigating to a new route.
		if (adminMenuRef.current) adminMenuRef.current.open = false;
		if (gamesMenuRef.current) gamesMenuRef.current.open = false;
	}, [pathname]);

	const items = useMemo(() => {
		const base: SiteNavItem[] = [{ href: '/', label: t('home') }];
		base.push({ href: '/units', label: t('units'), badge: null });
		base.push({ href: '/important', label: t('important'), badge: null });
		base.push({ href: '/rules', label: t('rules'), badge: null });
		return base;
	}, [t]);

	const gamesDropdownActive = isActiveGamesDropdown(pathname);

	return (
		<div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 shadow-sm shadow-black/20">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<nav className="flex flex-wrap items-center gap-3 sm:gap-2" aria-label={t('aria')}>
					{items.map((item) => {
						const active = isActivePath(pathname, item.href);
						return (
							<Link
								key={item.href}
								href={item.href}
								className={
									'inline-flex items-center rounded-full px-3 py-1.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950 ' +
									(active
										? 'bg-[color:var(--accent)] text-neutral-950'
										: 'text-neutral-300 hover:bg-white/5 hover:text-neutral-50')
								}
							>
								<span>{item.label}</span>
								{item.badge ? (
									<span
										className={
											'ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] ' +
											(active ? 'bg-black/15 text-neutral-950' : 'bg-[color:var(--accent)]/20 text-[color:var(--accent)]')
										}
									>
										{item.badge}
									</span>
								) : null}
							</Link>
						);
					})}

					{isAuthorized ? (
						<details ref={gamesMenuRef} className="relative">
							<summary
								aria-haspopup="menu"
								className={
									'inline-flex list-none items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950 [&::-webkit-details-marker]:hidden [&::marker]:hidden ' +
									(gamesDropdownActive
										? 'bg-[color:var(--accent)] text-neutral-950'
										: 'text-neutral-300 hover:bg-white/5 hover:text-neutral-50')
								}
							>
								{t('games')}
								{currentGame ? (
									<span
										className={
											'ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] ' +
											(gamesDropdownActive ? 'bg-black/15 text-neutral-950' : 'bg-[color:var(--accent)]/20 text-[color:var(--accent)]')
										}
									>
										{t('currentIndicator')}
									</span>
								) : null}
								<svg
									viewBox="0 0 20 20"
									fill="currentColor"
									className="h-4 w-4 opacity-80"
									aria-hidden="true"
								>
									<path
										fillRule="evenodd"
										d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
										clipRule="evenodd"
									/>
								</svg>
							</summary>

							<DropdownMenuPanel>
								{(() => {
									const gamesItems = [
										{ href: '/games', label: t('missions') },
										{ href: '/sanctions', label: t('sanctions') }
									] as const;
									return gamesItems.map((item) => (
										<Link
											key={item.href}
											href={item.href}
											role="menuitem"
											onClick={() => {
												if (gamesMenuRef.current) gamesMenuRef.current.open = false;
											}}
											className={
												'flex items-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950 ' +
												(isActivePath(pathname, item.href)
													? 'bg-white/10 text-neutral-50'
													: 'text-neutral-300 hover:bg-white/5 hover:text-neutral-50')
											}
										>
											{item.label}
										</Link>
									));
								})()}
							</DropdownMenuPanel>
						</details>
					) : null}

					{status?.connected && status.isAdmin ? (
						<details ref={adminMenuRef} className="relative">
							<summary
								aria-haspopup="menu"
								className={
									'inline-flex list-none items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950 [&::-webkit-details-marker]:hidden [&::marker]:hidden ' +
									(isActivePath(pathname, '/admin')
										? 'bg-[color:var(--accent)] text-neutral-950'
										: 'bg-white/10 text-neutral-50 hover:bg-white/20')
								}
							>
								{ta('nav')}
								<svg
									viewBox="0 0 20 20"
									fill="currentColor"
									className="h-4 w-4 opacity-80"
									aria-hidden="true"
								>
									<path
										fillRule="evenodd"
										d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
										clipRule="evenodd"
									/>
								</svg>
							</summary>

							<DropdownMenuPanel>
								{(() => {
									const items = [
										{ href: '/admin', label: ta('navApplications') },
										{ href: '/admin/users', label: ta('navUsers') },
										{ href: '/admin/badges', label: ta('navBadges') },
										{ href: '/admin/rename-requests', label: ta('navRenameRequests') },
										{ href: '/admin/mailing', label: ta('navMailing') },
										{ href: '/admin/games', label: ta('navGames') },
									{ href: '/admin/units', label: ta('navUnits') },
										{ href: '/admin/sanctions', label: ta('navSanctions') },
										{ href: '/admin/maintenance', label: ta('navMaintenance') }
									] as const;
									const activeHref = getActiveAdminHref(pathname);
									return items.map((item) => (
										<Link
											key={item.href}
											href={item.href}
											role="menuitem"
											onClick={() => {
												if (adminMenuRef.current) adminMenuRef.current.open = false;
											}}
											className={
												'flex items-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950 ' +
												(activeHref === item.href
													? 'bg-white/10 text-neutral-50'
													: 'text-neutral-300 hover:bg-white/5 hover:text-neutral-50')
											}
										>
											{item.label}
										</Link>
									));
								})()}
							</DropdownMenuPanel>
						</details>
					) : null}
				</nav>

				<LanguageSwitcher />
			</div>
		</div>
	);
}
