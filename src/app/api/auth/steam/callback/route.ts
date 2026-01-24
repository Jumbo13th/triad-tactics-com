import { getSteamCallbackRoute } from '@/features/steamAuth/adapters/next/callbackRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const GET = withApiGuards(getSteamCallbackRoute, { name: 'api.auth.steam.callback' });
