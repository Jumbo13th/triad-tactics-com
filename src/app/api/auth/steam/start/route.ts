import { getSteamStartRoute } from '@/features/steamAuth/adapters/next/startRoute';
import { withApiLogging } from '@/platform/nextRouteLogging';

export const runtime = 'nodejs';

export const GET = withApiLogging(getSteamStartRoute, { name: 'api.auth.steam.start' });
