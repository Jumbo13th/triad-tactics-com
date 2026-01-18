'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { usePathname } from '@/i18n/routing';
import { useAdminStatus } from './useAdminStatus';
import SteamSignInButton from './SteamSignInButton';

function buildLocalizedPath(locale: string, pathname: string) {
	const suffix = pathname === '/' ? '' : pathname;
	return `/${locale}${suffix}`;
}

export default function SteamAuthControls() {
	const t = useTranslations('auth');
	const pathname = usePathname();
	const params = useParams();
	const locale = (params.locale as string) || 'en';

	const redirectPath = useMemo(() => buildLocalizedPath(locale, pathname), [locale, pathname]);

	const status = useAdminStatus();
	const [loggingOut, setLoggingOut] = useState(false);

	const handleLogout = async () => {
		try {
			setLoggingOut(true);
			await fetch('/api/auth/steam/logout', { method: 'POST' });
			window.location.assign(redirectPath);
		} finally {
			setLoggingOut(false);
		}
	};

	if (!status) {
		return (
			<div
				className="h-10 w-full rounded-2xl bg-neutral-900/30 shadow-sm shadow-black/20 sm:w-[320px]"
				aria-hidden="true"
			/>
		);
	}

	if (!status.connected) {
		return (
			<SteamLoginModalButton redirectPath={redirectPath} />
		);
	}

	const name = status.callsign || status.personaName || status.steamid64;

	return (
		<div className="flex w-full flex-wrap items-center justify-center gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">
			<span
				title={name}
				className="inline-flex min-w-0 max-w-full items-center truncate rounded-2xl bg-white/10 px-3 py-2 text-sm font-semibold text-neutral-50 shadow-sm shadow-black/30 sm:max-w-[260px] md:max-w-[320px]"
			>
				{t('signedInAs', { name })}
			</span>
			<button
				className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-white/10 px-3 py-2 text-sm font-semibold text-neutral-50 shadow-sm shadow-black/30 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950 disabled:opacity-60"
				onClick={handleLogout}
				disabled={loggingOut}
			>
				{loggingOut ? t('signingOut') : t('signOut')}
			</button>
		</div>
	);
}
function SteamLoginModalButton({ redirectPath }: { redirectPath: string }) {
	const t = useTranslations('auth');
	const [open, setOpen] = useState(false);
	const closeButtonRef = useRef<HTMLButtonElement | null>(null);

	useEffect(() => {
		if (!open) return;
		closeButtonRef.current?.focus();
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false);
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previousOverflow;
		};
	}, [open]);

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="inline-flex w-full items-center justify-center rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-neutral-50 shadow-sm shadow-black/30 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950 sm:w-auto"
			>
				{t('signInSteam')}
			</button>

			{open && typeof document !== 'undefined'
				? createPortal(
					<div
						className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
						onMouseDown={(e) => {
							if (e.target === e.currentTarget) setOpen(false);
						}}
					>
						<div
							role="dialog"
							aria-modal="true"
							className="w-full max-w-2xl rounded-3xl border border-neutral-800 bg-neutral-950 p-6 shadow-[0_40px_120px_rgba(0,0,0,0.85)] sm:p-8"
						>
							<div className="flex items-start justify-between gap-4">
								<div>
									<p className="text-base font-semibold text-neutral-50">{t('signInSteam')}</p>
									<p className="mt-1 text-sm text-neutral-400">{t('notAssociatedWithValve')}</p>
								</div>
								<button
									ref={closeButtonRef}
									type="button"
									onClick={() => setOpen(false)}
									className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-700 bg-neutral-950 text-lg font-semibold leading-none text-neutral-200 shadow-sm shadow-black/30 hover:border-neutral-500 hover:bg-white/5 hover:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950"
									aria-label="Close"
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
							</div>

							<div className="mt-6 flex flex-col items-center justify-center gap-2">
								<SteamSignInButton
									redirectPath={redirectPath}
									ariaLabel={t('signInSteam')}
									size="large"
									className="inline-flex items-center justify-center rounded-lg focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950"
									imageClassName="h-14 w-auto"
								/>
								<p className="text-xs text-neutral-400">{t('clickSteamButton')}</p>
							</div>
						</div>
					</div>,
					document.body
				)
				: null}
		</>
	);
}
