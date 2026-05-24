import {GameMissionUpdateKind} from "@/features/games/domain/types";

type ParsedUpdateRequestData = {
    kind: GameMissionUpdateKind;
    shortCode: string | null;
    episodeNumber: number;
    totalEpisodes: number;
}

const DISCORD_MISSION_UPDATES_CHANNEL_ID = '1464208490410283071';
const DISCORD_MISSION_UPDATES_TIMEOUT_MS = 8000;

const getMissionUpdateDiscordMessages = (data: ParsedUpdateRequestData) => {
    const { kind, episodeNumber, totalEpisodes, shortCode } = data;
    const missionLink = shortCode ? `https://triad-tactics.com/ru/games/${shortCode}` : 'https://triad-tactics.com/ru/games';

    const ts = Math.floor(Date.now() / 1000);

    const missionUpdateDiscordMessagesMap = {
        units_slotting_started: `>>> <t:${ts}:T> \n` +
            `🛡️ **Отрядная расстановка началась!** \nОтрядные игроки могут вставать на слоты\nВсю информацию об игре вы можете найти на сайте: ${missionLink} \n `,
        priority_slotting_started: `>>> <t:${ts}:T> \n` +
            `⭐ **Приоритетная расстановка открыта!**\nИгроки с приоритетным статусом могут занимать слоты\n`,
        regular_slotting_started: `>>> <t:${ts}:T> \n` + '🌍 **Общая расстановка началась!**\nВсе игроки могут вставать на слоты\n ',
        game_started_wait_next_episode: `>>> <t:${ts}:T> \n` + `🔫 **Начался эпизод ${episodeNumber} из ${totalEpisodes}.**\n⏳ Ожидайте начала следующей игры...\n `,
    } as const;

    return missionUpdateDiscordMessagesMap[kind]
}

export async function notifyMissionUpdateInDiscord(data: ParsedUpdateRequestData, botToken: string | undefined): Promise<void> {
    if (!botToken) {
        throw new Error('DISCORD_BOT_TOKEN is not configured');
    }

    const response = await fetch(`https://discord.com/api/v10/channels/${DISCORD_MISSION_UPDATES_CHANNEL_ID}/messages`, {
        method: 'POST',
        headers: {
            Authorization: `Bot ${botToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({content: getMissionUpdateDiscordMessages(data)}),
        signal: AbortSignal.timeout(DISCORD_MISSION_UPDATES_TIMEOUT_MS)
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`discord_notify_failed:${response.status}:${body.slice(0, 300)}`);
    }
}
