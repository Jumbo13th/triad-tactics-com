import { getAdminStatsRoute, postAdminStatsRoute } from '@/features/stats/adapters/next/adminStatsRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const GET = withApiGuards(getAdminStatsRoute, { name: 'api.admin.stats.get', logSteamId: true });
export const POST = withApiGuards(postAdminStatsRoute, { name: 'api.admin.stats.post', logSteamId: true });
