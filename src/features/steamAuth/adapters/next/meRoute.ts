import { NextRequest, NextResponse } from 'next/server';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { getSteamStatus } from '@/features/steamAuth/useCases/getSteamStatus';
import { steamAuthDeps } from '@/features/steamAuth/deps';

export async function getSteamMeRoute(request: NextRequest): Promise<NextResponse> {
	const sid = request.cookies.get(STEAM_SESSION_COOKIE)?.value ?? null;
	const status = getSteamStatus(steamAuthDeps, sid);
	return NextResponse.json(status);
}
