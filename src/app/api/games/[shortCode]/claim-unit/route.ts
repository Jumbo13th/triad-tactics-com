import { postGameClaimUnitRoute } from '@/features/games/adapters/next/gameParticipationRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postGameClaimUnitRoute, {
	name: 'api.games.claim-unit.post',
	logSteamId: true
});
