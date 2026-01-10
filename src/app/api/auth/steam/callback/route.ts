import { NextRequest } from 'next/server';
import { getSteamCallbackRoute } from '@/features/steamAuth/adapters/next/callbackRoute';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
	return getSteamCallbackRoute(request);
}
