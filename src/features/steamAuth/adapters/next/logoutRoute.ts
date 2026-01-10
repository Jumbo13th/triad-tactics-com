import { NextRequest, NextResponse } from 'next/server';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { logoutSteam } from '@/features/steamAuth/useCases/logoutSteam';
import { steamAuthDeps } from '@/features/steamAuth/deps';

export async function postSteamLogoutRoute(request: NextRequest): Promise<NextResponse> {
	const sid = request.cookies.get(STEAM_SESSION_COOKIE)?.value ?? null;
	logoutSteam(steamAuthDeps, sid);

	const res = NextResponse.json({ success: true });
	res.cookies.set(STEAM_SESSION_COOKIE, '', {
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		path: '/',
		maxAge: 0
	});
	return res;
}
