import { getSteamMeRoute } from '@/features/steamAuth/adapters/next/meRoute';
import { withApiLogging } from '@/platform/nextRouteLogging';

export const runtime = 'nodejs';

export const GET = withApiLogging(getSteamMeRoute, { name: 'api.auth.steam.me' });
