import { postGameReleaseUnitRoute } from '@/features/games/adapters/next/gameParticipationRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postGameReleaseUnitRoute, {
	name: 'api.games.release-unit.post',
	logSteamId: true
});
