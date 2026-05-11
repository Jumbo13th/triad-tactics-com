import { putAdminGameUnitAssignmentsRoute } from '@/features/games/adapters/next/adminGameMissionRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const PUT = withApiGuards(putAdminGameUnitAssignmentsRoute, {
	name: 'api.admin.games.unit-assignments.put',
	logSteamId: true
});
