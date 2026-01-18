import { getAdminRenameRequestsRoute } from '@/features/admin/adapters/next/listRenameRequestsRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const GET = withApiGuards(getAdminRenameRequestsRoute, { name: 'api.admin.listRenameRequests', logSteamId: true });
