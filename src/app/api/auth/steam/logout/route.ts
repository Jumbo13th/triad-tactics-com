import { postSteamLogoutRoute } from '@/features/steamAuth/adapters/next/logoutRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postSteamLogoutRoute, { name: 'api.auth.steam.logout' });
