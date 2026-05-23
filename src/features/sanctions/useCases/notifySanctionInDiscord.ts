import type { SanctionType } from '@/features/sanctions/domain/types';

type SanctionCreatedData = {
	kind: 'created';
	callsign: string;
	type: SanctionType;
	reason: string;
	expiresAt: string | null;
	autoEscalation: boolean;
	adminCallsign: string;
};

type SanctionCancelledData = {
	kind: 'cancelled';
	callsign: string;
	type: SanctionType;
	originalReason: string;
	cancelReason: string;
	adminCallsign: string;
};

type SanctionExpiryChangedData = {
	kind: 'expiry_changed';
	callsign: string;
	type: SanctionType;
	originalReason: string;
	newExpiresAt: string | null;
	adminCallsign: string;
};

export type SanctionNotificationData = SanctionCreatedData | SanctionCancelledData | SanctionExpiryChangedData;

const DISCORD_SANCTIONS_CHANNEL_ID = '1507659367087083520';
const DISCORD_SANCTIONS_TIMEOUT_MS = 8000;

const SANCTION_TYPE_LABELS: Record<SanctionType, string> = {
	site_ban: 'Бан на сайте',
	server_ban: 'Бан на сервере',
	strike: 'Предупреждение',
};

const SANCTION_CREATED_HEADINGS: Record<SanctionType, string> = {
	site_ban: 'Выдан бан на сайте',
	server_ban: 'Выдан бан на сервере',
	strike: 'Выдано предупреждение',
};

const SANCTION_CANCELLED_HEADINGS: Record<SanctionType, string> = {
	site_ban: 'Бан на сайте снят',
	server_ban: 'Бан на сервере снят',
	strike: 'Предупреждение снято',
};

const SANCTION_TYPE_EMOJI: Record<SanctionType, string> = {
	site_ban: '🔒',
	server_ban: '⛔',
	strike: '⚠️',
};

function formatExpiresAt(expiresAt: string | null): string {
	if (!expiresAt) return 'Перманентно';
	const ms = new Date(expiresAt.replace(' ', 'T') + 'Z').getTime();
	if (isNaN(ms)) return 'Перманентно';
	return `<t:${Math.floor(ms / 1000)}:f>`;
}

function formatSanctionMessage(data: SanctionNotificationData): string {
	const ts = Math.floor(Date.now() / 1000);
	const emoji = SANCTION_TYPE_EMOJI[data.type];
	const label = SANCTION_TYPE_LABELS[data.type];

	switch (data.kind) {
		case 'created': {
			let message = `>>> <t:${ts}:T>\n` +
				`${emoji} **${SANCTION_CREATED_HEADINGS[data.type]}**\n` +
				`👤 Игрок: ${data.callsign}\n` +
				`📝 Причина: ${data.reason}\n` +
				`⏳ Истекает: ${formatExpiresAt(data.expiresAt)}\n` +
				`🛡️ Администратор: ${data.adminCallsign}\n`;

			if (data.autoEscalation) {
				message += `\n⛔ **3 активных предупреждения → автоматический серверный бан на 7 дней**\n`;
			}

			return message;
		}
		case 'cancelled':
			return `>>> <t:${ts}:T>\n` +
				`✅ **${SANCTION_CANCELLED_HEADINGS[data.type]}**\n` +
				`👤 Игрок: ${data.callsign}\n` +
				`📝 Изначальная причина: ${data.originalReason}\n` +
				`📝 Причина снятия: ${data.cancelReason}\n` +
				`🛡️ Администратор: ${data.adminCallsign}\n`;

		case 'expiry_changed':
			return `>>> <t:${ts}:T>\n` +
				`🔄 **Срок изменён — ${label}**\n` +
				`👤 Игрок: ${data.callsign}\n` +
				`📝 Изначальная причина: ${data.originalReason}\n` +
				`⏳ Новый срок: ${formatExpiresAt(data.newExpiresAt)}\n` +
				`🛡️ Администратор: ${data.adminCallsign}\n`;
	}
}

export async function notifySanctionInDiscord(data: SanctionNotificationData, botToken: string | undefined): Promise<void> {
	if (!botToken) {
		throw new Error('DISCORD_BOT_TOKEN is not configured');
	}

	const response = await fetch(`https://discord.com/api/v10/channels/${DISCORD_SANCTIONS_CHANNEL_ID}/messages`, {
		method: 'POST',
		headers: {
			Authorization: `Bot ${botToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ content: formatSanctionMessage(data) }),
		signal: AbortSignal.timeout(DISCORD_SANCTIONS_TIMEOUT_MS)
	});

	if (!response.ok) {
		const body = await response.text().catch(() => '');
		throw new Error(`discord_sanction_notify_failed:${response.status}:${body.slice(0, 300)}`);
	}
}
