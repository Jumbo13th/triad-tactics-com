import { getStatsVisibilityRoute } from '@/features/stats/adapters/next/statsVisibilityRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const GET = withApiGuards(getStatsVisibilityRoute, { name: 'api.stats.visibility' });
