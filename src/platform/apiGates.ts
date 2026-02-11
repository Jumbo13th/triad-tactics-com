import { NextRequest, NextResponse } from 'next/server';
import type { ApiLoggingOptions, RouteHandler } from './nextRouteLogging';
import { withApiLogging } from './nextRouteLogging';

const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const API_PREFIX = '/api/';
const ADMIN_API_PREFIX = '/api/admin';
const STEAM_AUTH_API_PREFIX = '/api/auth/steam/';
const CALLSIGN_API_PREFIX = '/api/callsign/';
const DISCORD_API_PREFIX = '/api/auth/discord';

function jsonError(error: string, status: number): Response {
	return NextResponse.json({ error }, { status });
}

function isEdgeRuntime(): boolean {
	return process.env.NEXT_RUNTIME === 'edge';
}

function isSafeMethod(method: string): boolean {
	return SAFE_HTTP_METHODS.has(method.toUpperCase());
}

function isApiPath(pathname: string): boolean {
	return pathname.startsWith(API_PREFIX);
}

function isAdminApiPath(pathname: string): boolean {
	return pathname.startsWith(ADMIN_API_PREFIX);
}

function isSteamAuthApiPath(pathname: string): boolean {
	return pathname.startsWith(STEAM_AUTH_API_PREFIX);
}

function isCallsignApiPath(pathname: string): boolean {
	return pathname.startsWith(CALLSIGN_API_PREFIX);
}

function isDiscordApiPath(pathname: string): boolean {
	return pathname.startsWith(DISCORD_API_PREFIX);
}

function getExpectedOrigin(request: NextRequest): string {
	const url = new URL(request.url);

	// Prefer forwarded headers when behind a proxy.
	const forwardedProto = request.headers.get('x-forwarded-proto');
	const forwardedHost = request.headers.get('x-forwarded-host');
	if (forwardedProto && forwardedHost) {
		return `${forwardedProto}://${forwardedHost}`;
	}

	return url.origin;
}

function getOriginFromHeaderValue(value: string): string | null {
	try {
		return new URL(value).origin;
	} catch {
		return null;
	}
}

function enforceSameOriginForAdminMutations(request: NextRequest): Response | null {
	// Safety: never try to enforce in edge runtime.
	if (isEdgeRuntime()) return null;

	const pathname = request.nextUrl.pathname;
	if (!isAdminApiPath(pathname)) return null;

	// Only protect state-changing requests.
	if (isSafeMethod(request.method)) return null;

	const expectedOrigin = getExpectedOrigin(request);

	// Browsers send Origin on fetch/XHR for POSTs; fall back to Referer for older flows.
	const originHeader = request.headers.get('origin');
	if (originHeader) return originHeader === expectedOrigin ? null : jsonError('csrf', 403);

	const refererHeader = request.headers.get('referer');
	if (refererHeader) {
		const refererOrigin = getOriginFromHeaderValue(refererHeader);
		if (refererOrigin && refererOrigin === expectedOrigin) return null;
	}

	return jsonError('csrf', 403);
}

function isAllowedDuringRenameBlock(pathname: string): boolean {
	// Allow Steam auth routes so the user can sign in/out.
	if (isSteamAuthApiPath(pathname)) return true;
	if (isDiscordApiPath(pathname)) return true;
	// Allow submitting a rename request and checking callsign availability.
	if (pathname === '/api/rename') return true;
	if (isCallsignApiPath(pathname)) return true;
	return false;
}

function isAllowedDuringApplyRequired(pathname: string): boolean {
	// Allow Steam auth routes so the user can sign in/out.
	if (isSteamAuthApiPath(pathname)) return true;
	if (isDiscordApiPath(pathname)) return true;
	// Allow application submission and callsign checks while filling the form.
	if (pathname === '/api/submit') return true;
	if (isCallsignApiPath(pathname)) return true;
	return false;
}

export async function enforceSteamGatesForApi(request: NextRequest): Promise<Response | null> {
	// Safety: never try to run DB-backed gating in edge runtime.
	if (isEdgeRuntime()) return null;

	const pathname = request.nextUrl.pathname;
	if (!isApiPath(pathname)) return null;

	// Admin routes do their own allowlist/auth checks (and admins may not have applied).
	if (isAdminApiPath(pathname)) return null;

	try {
		const { STEAM_SESSION_COOKIE } = await import('../features/steamAuth/sessionCookie');
		const { steamAuthDeps } = await import('../features/steamAuth/deps');
		const { getSteamStatus } = await import('../features/steamAuth/useCases/getSteamStatus');

		const sid = request.cookies.get(STEAM_SESSION_COOKIE)?.value ?? null;
		const status = getSteamStatus(steamAuthDeps, sid);
		if (!status.connected) return isCallsignApiPath(pathname) ? jsonError('steam_required', 401) : null;

		// Hard block: rename required until the user submits a rename request.
		if (status.renameRequired && !status.hasPendingRenameRequest) {
			return isAllowedDuringRenameBlock(pathname) ? null : jsonError('rename_required', 409);
		}

		// Steam users must apply before using the rest of the site.
		if (!status.hasExisting) {
			return isAllowedDuringApplyRequired(pathname) ? null : jsonError('application_required', 409);
		}

		return null;
	} catch {
		// Fail open: if gating can't be evaluated, don't take the whole API down.
		return null;
	}
}

export function withApiGuards(handler: RouteHandler, options: ApiLoggingOptions): RouteHandler {
	return withApiLogging(async (request: NextRequest) => {
		return (
			enforceSameOriginForAdminMutations(request) ??
			(await enforceSteamGatesForApi(request)) ??
			(await handler(request))
		);
	}, options);
}
