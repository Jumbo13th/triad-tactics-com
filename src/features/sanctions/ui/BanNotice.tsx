'use client';

import { useTranslations } from 'next-intl';
import { useUserStatus } from '@/features/users/ui/useUserStatus';
import { usePathname } from '@/i18n/routing';

function formatDate(iso: string): string {
	try {
		return new Date(iso.endsWith('Z') ? iso : iso + 'Z').toLocaleString();
	} catch {
		return iso;
	}
}

export default function BanNotice({ children }: { children: React.ReactNode }) {
	const ts = useTranslations('sanctions');
	const status = useUserStatus();
	const pathname = usePathname();

	if (!status?.connected || !status.siteBanned) return <>{children}</>;

	// Admins see the notice but can still access all pages
	const isAllowedPage = status.accessLevel === 'admin' || pathname === '/profile' || pathname.startsWith('/sanctions');

	return (
		<>
			<div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/5 p-5 shadow-sm shadow-black/20 sm:p-8">
				<h2 className="text-xl font-bold text-red-400">{ts('bannedTitle')}</h2>
				<p className="mt-2 text-sm text-neutral-300">{ts('bannedMessage')}</p>
				{status.siteBanReason ? (
					<p className="mt-2 text-sm text-neutral-300">{ts('bannedReason', { reason: status.siteBanReason })}</p>
				) : null}
				{status.siteBanExpiresAt ? (
					<p className="mt-2 text-sm text-neutral-400">{ts('bannedExpires', { date: formatDate(status.siteBanExpiresAt) })}</p>
				) : (
					<p className="mt-2 text-sm text-neutral-400">{ts('bannedPermanent')}</p>
				)}
				<p className="mt-3 text-xs text-neutral-500">{ts('bannedContact')}</p>
			</div>
			{isAllowedPage ? children : null}
		</>
	);
}
