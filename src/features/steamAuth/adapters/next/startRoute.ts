import { NextRequest, NextResponse } from 'next/server';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { startSteamLogin } from '@/features/steamAuth/useCases/startSteamLogin';
import { getRequestOrigin } from './origin';
import { steamAuthDeps } from '@/features/steamAuth/deps';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 10; // 10 days

export async function getSteamStartRoute(request: NextRequest): Promise<NextResponse> {
	const origin = getRequestOrigin(request);
	const redirectParam = request.nextUrl.searchParams.get('redirect');

	const result = startSteamLogin(steamAuthDeps, { origin, redirectParam });
	if (!result.ok) {
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}

	const response = NextResponse.redirect(result.steamLoginUrl);
	response.cookies.set(STEAM_SESSION_COOKIE, result.sessionId, {
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		path: '/',
		maxAge: COOKIE_MAX_AGE,
	});

	return response;
}
