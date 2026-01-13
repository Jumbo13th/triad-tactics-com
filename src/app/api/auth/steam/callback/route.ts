import { getSteamCallbackRoute } from '@/features/steamAuth/adapters/next/callbackRoute';
import { withApiLogging } from '@/platform/nextRouteLogging';

export const runtime = 'nodejs';

export const GET = withApiLogging(getSteamCallbackRoute, { name: 'api.auth.steam.callback' });
