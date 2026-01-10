import { NextRequest } from 'next/server';
import { getSteamStartRoute } from '@/features/steamAuth/adapters/next/startRoute';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
	return getSteamStartRoute(request);
}
