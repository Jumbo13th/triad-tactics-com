import { postAdminSetSlotsRoute } from '@/features/units/adapters/next/adminUnitRoutes';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postAdminSetSlotsRoute, { name: 'api.admin.units.slots', logSteamId: true });
