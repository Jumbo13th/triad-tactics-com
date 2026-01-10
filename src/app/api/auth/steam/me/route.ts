import { NextRequest } from 'next/server';
import { getSteamMeRoute } from '@/features/steamAuth/adapters/next/meRoute';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
	return getSteamMeRoute(request);
}
