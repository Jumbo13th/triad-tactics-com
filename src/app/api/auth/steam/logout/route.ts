import { NextRequest } from 'next/server';
import { postSteamLogoutRoute } from '@/features/steamAuth/adapters/next/logoutRoute';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
	return postSteamLogoutRoute(request);
}
