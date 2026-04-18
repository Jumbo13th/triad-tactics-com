import { getAdminListUnitsRoute } from '@/features/units/adapters/next/adminUnitRoutes';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const GET = withApiGuards(getAdminListUnitsRoute, { name: 'api.admin.units.list', logSteamId: true });
