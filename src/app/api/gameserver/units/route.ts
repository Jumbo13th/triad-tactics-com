import { getGameserverUnitsRoute } from '@/features/gameserver/adapters/next/unitsRoute';
import { withApiLogging } from '@/platform/nextRouteLogging';

export const runtime = 'nodejs';

export const GET = withApiLogging(getGameserverUnitsRoute, { name: 'api.gameserver.units' });
