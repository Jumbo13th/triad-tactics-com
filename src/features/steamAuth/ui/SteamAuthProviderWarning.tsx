'use client';

import { useTranslations } from 'next-intl';

export default function SteamAuthProviderWarning() {
	const t = useTranslations('auth');

	return (
		<div className="w-full rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-200">
			<p className="font-semibold">{t('steamAuthProviderWarningTitle')}</p>
			<p className="mt-1 text-xs text-amber-200/90">
				{t('steamAuthProviderWarningBody')}
			</p>
			<p className="mt-2 text-xs text-amber-200/90">
				{t('steamAuthProviderWarningVpn')}
			</p>
		</div>
	);
}
