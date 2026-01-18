'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { usePathname, Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';

type AdminNavItem = { key: 'applications' | 'users' | 'renameRequests'; href: string; label: string };

export default function AdminNav() {
	const ta = useTranslations('admin');
	const pathname = usePathname();
	const params = useParams();
	const locale = (params.locale as string) || 'en';

	const items: AdminNavItem[] = useMemo(
		() => [
			{ key: 'applications', href: '/admin', label: ta('navApplications') },
			{ key: 'users', href: '/admin/users', label: ta('navUsers') },
			{ key: 'renameRequests', href: '/admin/rename-requests', label: ta('navRenameRequests') }
		],
		[ta]
	);

	const activeHref = useMemo(() => {
		// pathname comes without locale prefix
		if (pathname.startsWith('/admin/users')) return '/admin/users';
		if (pathname.startsWith('/admin/rename-requests')) return '/admin/rename-requests';
		return '/admin';
	}, [pathname]);

	return (
		<nav aria-label={ta('nav')} className="flex flex-wrap items-center gap-2">
			{items.map((item) => {
				const active = item.href === activeHref;
				return (
					<Link
						key={item.key}
						href={item.href}
						locale={locale}
						className={
							'inline-flex items-center rounded-full px-3 py-1.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950 ' +
							(active
								? 'bg-[color:var(--accent)] text-neutral-950'
								: 'bg-white/10 text-neutral-50 hover:bg-white/20')
						}
					>
						{item.label}
					</Link>
				);
			})}
		</nav>
	);
}
