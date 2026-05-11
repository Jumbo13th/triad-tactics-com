import { postAdminGameHideUnitRoute } from '@/features/games/adapters/next/adminGameMissionRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postAdminGameHideUnitRoute, {
	name: 'api.admin.games.hide-unit.post',
	logSteamId: true
});
