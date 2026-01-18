import { NextRequest, NextResponse } from 'next/server';
import type { RouteHandler } from './nextRouteLogging';
import { withApiLogging } from './nextRouteLogging';

function isAllowedDuringRenameBlock(pathname: string): boolean {
	// Allow Steam auth routes so the user can sign in/out.
	if (pathname.startsWith('/api/auth/steam/')) return true;
	// Allow submitting a rename request and checking callsign availability.
	if (pathname === '/api/rename') return true;
	if (pathname.startsWith('/api/callsign/')) return true;
	return false;
}

function isAllowedDuringApplyRequired(pathname: string): boolean {
	// Allow Steam auth routes so the user can sign in/out.
	if (pathname.startsWith('/api/auth/steam/')) return true;
	// Allow application submission and callsign checks while filling the form.
	if (pathname === '/api/submit') return true;
	if (pathname.startsWith('/api/callsign/')) return true;
	return false;
}

export async function enforceSteamGatesForApi(request: NextRequest): Promise<Response | null> {
	// Safety: never try to run DB-backed gating in edge runtime.
	if (process.env.NEXT_RUNTIME === 'edge') return null;

	const pathname = request.nextUrl.pathname;
	if (!pathname.startsWith('/api/')) return null;

	// Admin routes do their own allowlist/auth checks (and admins may not have applied).
	if (pathname.startsWith('/api/admin')) return null;

	try {
		const { STEAM_SESSION_COOKIE } = await import('../features/steamAuth/sessionCookie');
		const { steamAuthDeps } = await import('../features/steamAuth/deps');
		const { getSteamStatus } = await import('../features/steamAuth/useCases/getSteamStatus');

		const sid = request.cookies.get(STEAM_SESSION_COOKIE)?.value ?? null;
		const status = getSteamStatus(steamAuthDeps, sid);
		if (!status.connected) return null;

		// Hard block: rename required until the user submits a rename request.
		if (status.renameRequired && !status.hasPendingRenameRequest) {
			if (isAllowedDuringRenameBlock(pathname)) return null;
			return NextResponse.json({ error: 'rename_required' }, { status: 409 });
		}

		// Steam users must apply before using the rest of the site.
		if (!status.hasExisting) {
			if (isAllowedDuringApplyRequired(pathname)) return null;
			return NextResponse.json({ error: 'application_required' }, { status: 409 });
		}

		return null;
	} catch {
		// Fail open: if gating can't be evaluated, don't take the whole API down.
		return null;
	}
}

export function withApiGuards(handler: RouteHandler, options: { name: string }): RouteHandler {
	return withApiLogging(async (request: NextRequest) => {
		const gateResponse = await enforceSteamGatesForApi(request);
		if (gateResponse) return gateResponse;
		return handler(request);
	}, options);
}
