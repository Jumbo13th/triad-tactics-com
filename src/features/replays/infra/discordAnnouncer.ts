import type { ReplayAnnouncement } from '../ports';

// The "stage of games" channel, where the community already follows each mission's
// progress; the news channel stays reserved for mission announcements.
const DISCORD_MISSION_UPDATES_CHANNEL_ID = '1489978114971930684';
const DISCORD_TIMEOUT_MS = 8000;
const SITE = 'https://triad-tactics.com/ru';

export function announcementText(announcement: ReplayAnnouncement, nowSeconds: number): string {
	const lines = [
		`>>> <t:${nowSeconds}:T>`,
		`🎬 **Реплей опубликован: ${announcement.missionTitle}, эпизод ${announcement.episodeNumber}**`,
		`Смотреть: ${SITE}/replays/${announcement.gameId}`,
	];
	if (announcement.statsId !== null) lines.push(`Статистика: ${SITE}/stats/games/${announcement.statsId}`);
	else if (announcement.missionShortCode) lines.push(`Миссия: ${SITE}/games/${announcement.missionShortCode}`);
	return lines.join('\n');
}

export async function announce(announcement: ReplayAnnouncement): Promise<'sent' | 'skipped'> {
	const botToken = process.env.DISCORD_BOT_TOKEN?.trim();
	if (!botToken) return 'skipped';

	const response = await fetch(`https://discord.com/api/v10/channels/${DISCORD_MISSION_UPDATES_CHANNEL_ID}/messages`, {
		method: 'POST',
		headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ content: announcementText(announcement, Math.floor(Date.now() / 1000)) }),
		signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
	});
	if (!response.ok) {
		const body = await response.text().catch(() => '');
		throw new Error(`discord_replay_announce_failed:${response.status}:${body.slice(0, 300)}`);
	}
	return 'sent';
}
