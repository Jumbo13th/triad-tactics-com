import { getUnitDetailRoute, putUpdateUnitRoute, deleteUnitRoute } from '@/features/units/adapters/next/unitRoutes';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const GET = withApiGuards(getUnitDetailRoute, { name: 'api.units.detail', logSteamId: false });
export const PUT = withApiGuards(putUpdateUnitRoute, { name: 'api.units.update', logSteamId: true });
export const DELETE = withApiGuards(deleteUnitRoute, { name: 'api.units.delete', logSteamId: true });
