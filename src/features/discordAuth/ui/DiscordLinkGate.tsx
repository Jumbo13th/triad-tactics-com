'use client';

import { useTranslations } from 'next-intl';
import { useUserStatus } from '@/features/users/ui/useUserStatus';
import { DiscordLinkButton } from './DiscordLinkButton';

export default function DiscordLinkGate() {
	const t = useTranslations('discordAuth');
	const status = useUserStatus();

	if (!status || !status.connected) return null;
	if (!status.playerConfirmed) return null;

	return (
		<DiscordLinkButton
			className={
				status.discordId
					? 'border border-[#5865F2] bg-transparent text-[#5865F2] hover:bg-[#5865F2]/10'
					: undefined
			}
			onClick={() => {
				window.location.assign('/api/auth/discord/start/');
			}}>
			{status.discordId ? t('relink') : t('link')}
		</DiscordLinkButton>
	);
}
