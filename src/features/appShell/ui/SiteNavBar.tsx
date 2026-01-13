'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, Link } from '@/i18n/routing';
import LanguageSwitcher from '@/features/language/ui/LanguageSwitcher';
import { useAdminStatus } from '@/features/steamAuth/ui/useAdminStatus';

function isActivePath(currentPathname: string, href: string) {
	if (href === '/') return currentPathname === '/';
	return currentPathname === href || currentPathname.startsWith(`${href}/`);
}

export default function SiteNavBar() {
	const t = useTranslations('nav');
	const ta = useTranslations('admin');
	const pathname = usePathname();
	const status = useAdminStatus();
	const adminMenuRef = useRef<HTMLDetailsElement>(null);

	useEffect(() => {
		// Close the dropdown when navigating to a new route.
		if (adminMenuRef.current) adminMenuRef.current.open = false;
	}, [pathname]);

	const items = useMemo(() => {
		return [
			{ href: '/', label: t('home') }
		];
	}, [t]);

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
										? 'bg-white/10 text-neutral-50'
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

							<div
								role="menu"
								className="absolute left-0 z-20 mt-2 min-w-52 rounded-2xl border border-neutral-800 bg-neutral-950 p-1 shadow-lg shadow-black/30"
							>
								<Link
									href="/admin"
									role="menuitem"
									onClick={() => {
										if (adminMenuRef.current) adminMenuRef.current.open = false;
									}}
									className={
										'flex items-center rounded-xl px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950 ' +
										(isActivePath(pathname, '/admin')
											? 'bg-white/10 text-neutral-50'
											: 'text-neutral-300 hover:bg-white/5 hover:text-neutral-50')
									}
								>
									{ta('applicationsTitle')}
								</Link>
							</div>
						</details>
					) : null}
				</nav>

				<LanguageSwitcher />
			</div>
		</div>
	);
}
