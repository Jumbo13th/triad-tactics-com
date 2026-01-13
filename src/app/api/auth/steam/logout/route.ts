import { postSteamLogoutRoute } from '@/features/steamAuth/adapters/next/logoutRoute';
import { withApiLogging } from '@/platform/nextRouteLogging';

export const runtime = 'nodejs';

export const POST = withApiLogging(postSteamLogoutRoute, { name: 'api.auth.steam.logout' });
