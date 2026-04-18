import { getAdminUnitDetailRoute, putAdminUpdateUnitRoute } from '@/features/units/adapters/next/adminUnitRoutes';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const GET = withApiGuards(getAdminUnitDetailRoute, { name: 'api.admin.units.detail', logSteamId: true });
export const PUT = withApiGuards(putAdminUpdateUnitRoute, { name: 'api.admin.units.update', logSteamId: true });
