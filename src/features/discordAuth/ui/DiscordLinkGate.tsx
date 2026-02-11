'use client';

import { useSteamStatus } from '@/features/steamAuth/ui/useSteamStatus';
import { DiscordLinkButton } from './DiscordLinkButton';

export default function DiscordLinkGate() {
	const status = useSteamStatus();

	console.log(status);

	if (!status || !status.connected) return null;
	// TODO сделать кнопку реюзабл
	if (!status.playerConfirmed) return null;
	// TODO i18n
	return (
		<DiscordLinkButton
			onClick={() => {
				window.location.assign('/api/auth/discord/start/');
			}}>
			{status.discordId === null ? 'Привязать дискорд' : 'Перепривязать дискорд'}
		</DiscordLinkButton>
	);
}
