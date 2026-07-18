import { getGameserverSeasonRoute } from '@/features/stats/adapters/next/gameserverSeasonRoute';
import { withApiLogging } from '@/platform/nextRouteLogging';

export const runtime = 'nodejs';

export const GET = withApiLogging(getGameserverSeasonRoute, { name: 'api.gameserver.season' });
