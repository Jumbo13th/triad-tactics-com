import { postManageMembersRoute } from '@/features/units/adapters/next/unitRoutes';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postManageMembersRoute, { name: 'api.units.members.manage', logSteamId: true });
