import { getGameserverPlayerRoute } from '@/features/gameserver/adapters/next/playerRoute';
import { withApiLogging } from '@/platform/nextRouteLogging';

export const runtime = 'nodejs';

export const GET = withApiLogging(getGameserverPlayerRoute, { name: 'api.gameserver.player' });
