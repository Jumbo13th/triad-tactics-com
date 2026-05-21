import { deleteAdminGameEpisodeRoute, putAdminGameSlottingRoute } from '@/features/games/adapters/next/adminGameMissionRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const PUT = withApiGuards(putAdminGameSlottingRoute, {
	name: 'api.admin.games.slotting.put',
	logSteamId: true
});

export const DELETE = withApiGuards(deleteAdminGameEpisodeRoute, {
	name: 'api.admin.games.slotting.delete',
	logSteamId: true
});
