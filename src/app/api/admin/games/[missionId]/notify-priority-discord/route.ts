import { postAdminGameNotifyPriorityDiscordRoute } from '@/features/games/adapters/next/adminGameMissionRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postAdminGameNotifyPriorityDiscordRoute, {
	name: 'api.admin.games.notify-priority-discord.post',
	logSteamId: true
});
