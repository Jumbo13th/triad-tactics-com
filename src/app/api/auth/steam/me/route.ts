import { getSteamMeRoute } from '@/features/steamAuth/adapters/next/meRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const GET = withApiGuards(getSteamMeRoute, { name: 'api.auth.steam.me' });
