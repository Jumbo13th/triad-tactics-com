import { postAdminManageMembersRoute } from '@/features/units/adapters/next/adminUnitRoutes';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postAdminManageMembersRoute, { name: 'api.admin.units.members', logSteamId: true });
