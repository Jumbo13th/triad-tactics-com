import { getAdminApplicationsRoute } from '@/features/admin/adapters/next/listApplicationsRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const GET = withApiGuards(getAdminApplicationsRoute, { name: 'api.admin.listApplications' });
