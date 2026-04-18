import { postAdminVerifyUnitRoute } from '@/features/units/adapters/next/adminUnitRoutes';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postAdminVerifyUnitRoute, { name: 'api.admin.units.verify', logSteamId: true });
