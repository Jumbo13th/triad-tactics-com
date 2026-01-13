'use client';

import { useMemo } from 'react';
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

	const items = useMemo(() => {
		return [
			{ href: '/', label: t('home') }
		];
	}, [t]);

	return (
		<div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 shadow-sm shadow-black/20">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<nav className="flex flex-wrap items-center gap-2" aria-label={t('aria')}>
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
						<Link
							href="/admin"
							className={
								'inline-flex items-center rounded-full px-3 py-1.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950 ' +
								(isActivePath(pathname, '/admin')
									? 'bg-[color:var(--accent)] text-neutral-950'
									: 'bg-white/10 text-neutral-50 hover:bg-white/20')
							}
						>
							{ta('nav')}
						</Link>
					) : null}
				</nav>

				<LanguageSwitcher />
			</div>
		</div>
	);
}
