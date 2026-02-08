import { getAdminContentRoute, putAdminContentRoute } from '@/features/content/adapters/next/adminContentRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const GET = withApiGuards(getAdminContentRoute, { name: 'api.admin.content.get', logSteamId: true });
export const PUT = withApiGuards(putAdminContentRoute, { name: 'api.admin.content.put', logSteamId: true });
