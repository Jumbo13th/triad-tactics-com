import { postAdminSetLeaderRoute } from '@/features/units/adapters/next/adminUnitRoutes';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postAdminSetLeaderRoute, { name: 'api.admin.units.leader', logSteamId: true });
