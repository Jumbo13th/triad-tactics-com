'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/features/language/ui/root';
import { Link, usePathname } from '@/i18n/routing';

function isReplaysPath(pathname: string): boolean {
	return pathname === '/replays' || pathname.startsWith('/replays/');
}

// The replays section is a full-width tool with its own slim bar: a battle map needs the
// whole window, which the site's narrow reading column cannot give it.
function ReplaysBar({ display }: { display: string }) {
	const t = useTranslations('nav');
	const pathname = usePathname();
	const link = (href: string, label: string, active: boolean) => (
		<Link
			href={href}
			aria-current={active ? 'page' : undefined}
			className={
				'inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold ' +
				(active ? 'bg-white/10 text-neutral-50' : 'text-neutral-300 hover:bg-white/5 hover:text-neutral-50')
			}
		>
			{label}
		</Link>
	);
	return (
		<header className={`${display} flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-800 pb-3`}>
			<Link href="/" className="flex items-center gap-2.5" aria-label={t('home')}>
				<Image src="/triad-logo.png" alt="" width={40} height={40} className="size-10" />
				<span className="hidden text-sm font-bold uppercase tracking-[0.08em] text-neutral-50 sm:inline">Triad Tactics</span>
			</Link>
			<nav aria-label={t('aria')} className="flex flex-1 flex-wrap items-center gap-1">
				{link('/replays', t('replays'), pathname === '/replays')}
				{link('/stats', t('stats'), false)}
				{link('/games', t('missions'), false)}
			</nav>
			<LanguageSwitcher />
		</header>
	);
}

export default function SiteFrame({ header, footer, children }: { header: ReactNode; footer: ReactNode; children: ReactNode }) {
	const pathname = usePathname();
	if (isReplaysPath(pathname)) {
		// A replay on a phone keeps the screen for the map; its own header leads back.
		const viewer = pathname.startsWith('/replays/');
		return (
			<div className="mx-auto flex min-h-dvh w-full max-w-[1600px] flex-col px-3 pt-3 pb-4 sm:px-4">
				<ReplaysBar display={viewer ? 'hidden lg:flex' : 'flex'} />
				{/* A flex column all the way down, so the viewer can take exactly the height left. */}
				<div className="mt-3 flex min-h-0 flex-1 flex-col">{children}</div>
			</div>
		);
	}
	return (
		<div className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 pt-6 pb-2 sm:pt-8 sm:pb-6">
			{header}
			<div className="mt-6 flex-1">{children}</div>
			{footer}
		</div>
	);
}
