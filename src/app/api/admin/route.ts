import { getAdminApplicationsRoute } from '@/features/admin/adapters/next/listApplicationsRoute';
import { withApiLogging } from '@/platform/nextRouteLogging';

export const runtime = 'nodejs';

export const GET = withApiLogging(getAdminApplicationsRoute, { name: 'api.admin.listApplications' });
