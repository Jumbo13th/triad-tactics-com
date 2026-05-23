import type { CanonicalSlotting } from '@/features/games/domain/slotting';
import { sideDisplayName, hasSlotAccess } from '@/features/games/domain/slotting';

type MissionPublishedData = {
	title: string;
	descriptionRu: string;
	shortCode: string;
	startsAt: string;
	episodeCount: number;
	slotting: CanonicalSlotting;
	priorityClaimOpensAt: string | null;
	regularJoinEnabled: boolean;
	confirmedRoleId: string | undefined;
	imageData: string | null;
	imageMime: string | null;
};

const DISCORD_CHANNEL_ID = '1507659367087083520';
const DISCORD_TIMEOUT_MS = 8000;
const EMBED_COLOR = 0xC8A83E;

function toUnixTimestamp(iso: string): number {
	return Math.floor(new Date(iso.replace(' ', 'T') + (iso.includes('T') || iso.includes('Z') ? '' : 'Z')).getTime() / 1000);
}

function countTotalSlots(slotting: CanonicalSlotting): number {
	let count = 0;
	for (const side of slotting.sides) {
		for (const squad of side.squads) {
			count += squad.slots.length;
		}
	}
	return count;
}

function formatSides(slotting: CanonicalSlotting): string {
	return slotting.sides.map((side) => sideDisplayName(side)).join(' vs ');
}

const MIME_TO_EXT: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
};

function buildEmbed(data: MissionPublishedData) {
	const missionLink = `https://triad-tactics.com/ru/games/${data.shortCode}`;
	const totalSlots = countTotalSlots(data.slotting);
	const sides = formatSides(data.slotting);
	const ts = toUnixTimestamp(data.startsAt);

	const lines: string[] = [];

	if (data.descriptionRu) {
		lines.push(data.descriptionRu);
		lines.push('');
	}

	lines.push(`⚔️ **${sides}**`);
	lines.push(`📅 **Дата:** <t:${ts}:D> (<t:${ts}:R>)`);
	lines.push(`🎬 **Эпизодов:** ${data.episodeCount}`);
	lines.push(`👥 **Слотов:** ${totalSlots}`);
	lines.push('');

	const hasUnit = hasSlotAccess(data.slotting, 'unit');
	const hasRegular = hasSlotAccess(data.slotting, 'regular') || data.regularJoinEnabled;
	const hasPriority = hasSlotAccess(data.slotting, 'priority');
	const hasPriorityScheduled = !!data.priorityClaimOpensAt;

	const openNow: string[] = [];
	if (hasUnit) openNow.push('отрядная');
	if (hasPriority) openNow.push('приоритетная');
	if (hasRegular) openNow.push('общая');
	if (openNow.length > 0) {
		lines.push(`🟢 Расстановка открыта: **${openNow.join(', ')}**`);
	}

	if (!hasPriority && hasPriorityScheduled) {
		const priorityTs = toUnixTimestamp(data.priorityClaimOpensAt!);
		lines.push(`⭐ Приоритетная расстановка откроется: <t:${priorityTs}:f> (<t:${priorityTs}:R>)`);
	}

	lines.push('');
	lines.push(`📣 **Занимайте слоты и готовьтесь к игре!**`);
	lines.push('');
	lines.push(`Время начала, адрес сервера и вся информация об игре на сайте:`);
	lines.push(`🔗 ${missionLink}`);

	const embed: Record<string, unknown> = {
		title: `📢 Анонс миссии — ${data.title}`,
		description: lines.join('\n'),
		color: EMBED_COLOR,
	};

	if (data.imageData && data.imageMime) {
		const ext = MIME_TO_EXT[data.imageMime] ?? 'png';
		embed.image = { url: `attachment://mission.${ext}` };
	}

	return embed;
}

export async function notifyMissionPublishedInDiscord(data: MissionPublishedData, botToken: string | undefined): Promise<void> {
	if (!botToken) {
		throw new Error('DISCORD_BOT_TOKEN is not configured');
	}

	const url = `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`;
	const embed = buildEmbed(data);

	const payload: Record<string, unknown> = { embeds: [embed] };
	if (data.confirmedRoleId) {
		payload.content = `<@&${data.confirmedRoleId}>`;
	}

	let fetchOptions: RequestInit;

	if (data.imageData && data.imageMime) {
		const ext = MIME_TO_EXT[data.imageMime] ?? 'png';
		const imageBuffer = Buffer.from(data.imageData, 'base64');

		const form = new FormData();
		form.append('payload_json', JSON.stringify(payload));
		form.append('files[0]', new Blob([imageBuffer], { type: data.imageMime }), `mission.${ext}`);

		fetchOptions = {
			method: 'POST',
			headers: { Authorization: `Bot ${botToken}` },
			body: form,
			signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS)
		};
	} else {
		fetchOptions = {
			method: 'POST',
			headers: {
				Authorization: `Bot ${botToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS)
		};
	}

	const response = await fetch(url, fetchOptions);

	if (!response.ok) {
		const responseBody = await response.text().catch(() => '');
		throw new Error(`discord_publish_notify_failed:${response.status}:${responseBody.slice(0, 300)}`);
	}
}

type PrioritySlottingOpenedData = {
	title: string;
	shortCode: string;
	startsAt: string;
	discordRoleIds?: string[];
};

export async function notifyPrioritySlottingInDiscord(data: PrioritySlottingOpenedData, botToken: string | undefined): Promise<void> {
	if (!botToken) {
		throw new Error('DISCORD_BOT_TOKEN is not configured');
	}

	const missionLink = `https://triad-tactics.com/ru/games/${data.shortCode}`;
	const ts = toUnixTimestamp(data.startsAt);

	const embed = {
		title: `⭐ Приоритетная расстановка открыта — ${data.title}`,
		description:
			`Игроки с приоритетным статусом могут занимать слоты\n` +
			`📅 **Дата игры:** <t:${ts}:D> (<t:${ts}:R>)\n` +
			`\n` +
			`📣 **Занимайте слоты и готовьтесь к игре!**\n` +
			`\n` +
			`🔗 ${missionLink}`,
		color: EMBED_COLOR,
	};

	const roleMentions = data.discordRoleIds?.length
		? data.discordRoleIds.map((id) => `<@&${id}>`).join(' ')
		: undefined;

	const response = await fetch(`https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`, {
		method: 'POST',
		headers: {
			Authorization: `Bot ${botToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			...(roleMentions ? { content: roleMentions } : {}),
			embeds: [embed],
		}),
		signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS)
	});

	if (!response.ok) {
		const responseBody = await response.text().catch(() => '');
		throw new Error(`discord_priority_notify_failed:${response.status}:${responseBody.slice(0, 300)}`);
	}
}
