import { getAdminUsersRoute } from '@/features/admin/adapters/next/listUsersRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const GET = withApiGuards(getAdminUsersRoute, { name: 'api.admin.listUsers' });
