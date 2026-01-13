import { NextRequest, NextResponse } from 'next/server';
import { STEAM_WEB_API_KEY } from '@/platform/env';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { handleSteamCallback } from '@/features/steamAuth/useCases/handleSteamCallback';
import { getRequestOrigin } from './origin';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { errorToLogObject, logger } from '@/platform/logger';

export async function getSteamCallbackRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const origin = getRequestOrigin(request);
		const sidFromQuery = request.nextUrl.searchParams.get('sid');
		const sidFromCookie = request.cookies.get(STEAM_SESSION_COOKIE)?.value ?? null;

		const { redirectPath } = await handleSteamCallback(steamAuthDeps, {
			sidFromQuery,
			sidFromCookie,
			query: request.nextUrl.searchParams,
			steamWebApiKey: STEAM_WEB_API_KEY
		});

		return NextResponse.redirect(new URL(redirectPath || '/', origin));
	} catch (error: unknown) {
		logger.warn({ ...errorToLogObject(error) }, 'steam_callback_route_failed');
		return NextResponse.redirect(new URL('/', getRequestOrigin(request)));
	}
}
