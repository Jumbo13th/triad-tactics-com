'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, Link } from '@/i18n/routing';
import { LanguageSwitcher } from '@/features/language/ui/root';
import { useAdminStatus, useSteamStatus } from '@/features/steamAuth/ui/root';
import { DropdownMenuPanel } from '@/features/appShell/ui/root';

function isActivePath(currentPathname: string, href: string) {
	if (href === '/') return currentPathname === '/';
	return currentPathname === href || currentPathname.startsWith(`${href}/`);
}

function getActiveAdminHref(pathname: string) {
	// pathname comes without locale prefix
	if (pathname.startsWith('/admin/users')) return '/admin/users';
	if (pathname.startsWith('/admin/rename-requests')) return '/admin/rename-requests';
	if (pathname.startsWith('/admin/mailing')) return '/admin/mailing';
	if (pathname.startsWith('/admin/content')) return '/admin/content';
	return '/admin';
}

export default function SiteNavBar() {
	const t = useTranslations('nav');
	const ta = useTranslations('admin');
	const pathname = usePathname();
	const status = useAdminStatus();
	const steamStatus = useSteamStatus();
	const adminMenuRef = useRef<HTMLDetailsElement>(null);

	useEffect(() => {
		// Close the dropdown when navigating to a new route.
		if (adminMenuRef.current) adminMenuRef.current.open = false;
	}, [pathname]);

	const items = useMemo(() => {
		const base = [{ href: '/', label: t('home') }];
		if (steamStatus?.connected && (steamStatus.accessLevel === 'player' || steamStatus.accessLevel === 'admin')) {
			base.push({ href: '/feed', label: t('feed') });
		}
		return base;
	}, [t, steamStatus]);

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
								{item.label}
							</Link>
						);
					})}

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
										{ href: '/admin/rename-requests', label: ta('navRenameRequests') },
										{ href: '/admin/mailing', label: ta('navMailing') },
										{ href: '/admin/content', label: ta('navContent') }
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
