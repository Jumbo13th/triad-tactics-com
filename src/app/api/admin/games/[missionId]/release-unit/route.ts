import { postAdminGameReleaseUnitRoute } from '@/features/games/adapters/next/adminGameMissionRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postAdminGameReleaseUnitRoute, {
	name: 'api.admin.games.release-unit.post',
	logSteamId: true
});
