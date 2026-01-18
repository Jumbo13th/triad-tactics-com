import { getSteamStartRoute } from '@/features/steamAuth/adapters/next/startRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const GET = withApiGuards(getSteamStartRoute, { name: 'api.auth.steam.start' });
