import { getAdminStatusRoute } from '@/features/admin/adapters/next/statusRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const GET = withApiGuards(getAdminStatusRoute, { name: 'api.admin.status' });
