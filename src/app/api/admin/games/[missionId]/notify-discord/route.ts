import { postAdminGameNotifyDiscordRoute } from '@/features/games/adapters/next/adminGameMissionRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postAdminGameNotifyDiscordRoute, {
	name: 'api.admin.games.notify-discord.post',
	logSteamId: true
});
