import { NextRequest, NextResponse } from 'next/server';
import type { ApiLoggingOptions, RouteHandler } from './nextRouteLogging';
import { withApiLogging } from './nextRouteLogging';

const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const API_PREFIX = '/api/';
const ADMIN_API_PREFIX = '/api/admin';
const STEAM_AUTH_API_PREFIX = '/api/auth/steam/';
const CALLSIGN_API_PREFIX = '/api/callsign/';
const DISCORD_API_PREFIX = '/api/auth/discord';
const USER_STATUS_API_PATH = '/api/me';

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
	if (isEdgeRuntime()) return null;

	const pathname = request.nextUrl.pathname;
	if (!isAdminApiPath(pathname)) return null;
	if (isSafeMethod(request.method)) return null;

	const expectedOrigin = getExpectedOrigin(request);
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
	if (isSteamAuthApiPath(pathname)) return true;
	if (isDiscordApiPath(pathname)) return true;
	if (pathname === USER_STATUS_API_PATH) return true;
	if (pathname === '/api/rename') return true;
	if (isCallsignApiPath(pathname)) return true;
	return false;
}

function isAllowedDuringApplyRequired(pathname: string): boolean {
	if (isSteamAuthApiPath(pathname)) return true;
	if (isDiscordApiPath(pathname)) return true;
	if (pathname === USER_STATUS_API_PATH) return true;
	if (pathname === '/api/submit') return true;
	if (isCallsignApiPath(pathname)) return true;
	return false;
}

function isAllowedDuringConfirmationPending(pathname: string): boolean {
	if (isSteamAuthApiPath(pathname)) return true;
	if (pathname === USER_STATUS_API_PATH) return true;
	return false;
}

function isAllowedDuringArmaIdRequired(pathname: string): boolean {
	if (isSteamAuthApiPath(pathname)) return true;
	if (pathname === USER_STATUS_API_PATH) return true;
	if (pathname === '/api/arma-id') return true;
	return false;
}

function isAllowedDuringSiteBan(pathname: string): boolean {
	if (isSteamAuthApiPath(pathname)) return true;
	if (pathname === USER_STATUS_API_PATH) return true;
	if (pathname === '/api/me/sanctions') return true;
	if (pathname === '/api/sanctions') return true;
	return false;
}

export async function enforceSteamGatesForApi(request: NextRequest): Promise<Response | null> {
	if (isEdgeRuntime()) return null;

	const pathname = request.nextUrl.pathname;
	if (!isApiPath(pathname)) return null;
	if (isAdminApiPath(pathname)) return null;

	try {
		const { STEAM_SESSION_COOKIE } = await import('../features/steamAuth/sessionCookie');
		const { steamAuthDeps } = await import('../features/steamAuth/deps');
		const { isConfirmedByAccessLevel } = await import('../features/users/domain/api');
		const { getUserStatus } = await import('../features/users/useCases/getUserStatus');

		const sid = request.cookies.get(STEAM_SESSION_COOKIE)?.value ?? null;
		const status = getUserStatus(steamAuthDeps, sid);
		if (!status.connected) return isCallsignApiPath(pathname) ? jsonError('steam_required', 401) : null;

		if (status.renameRequired && !status.hasPendingRenameRequest) {
			return isAllowedDuringRenameBlock(pathname) ? null : jsonError('rename_required', 409);
		}

		if (!status.hasExisting) {
			return isAllowedDuringApplyRequired(pathname) ? null : jsonError('application_required', 409);
		}

		if (!isConfirmedByAccessLevel(status.accessLevel)) {
			return isAllowedDuringConfirmationPending(pathname) ? null : jsonError('forbidden', 403);
		}

		if (status.armaGuidRequired) {
			return isAllowedDuringArmaIdRequired(pathname) ? null : jsonError('arma_id_required', 409);
		}

		if (!isAllowedDuringSiteBan(pathname)) {
			const { getActiveSiteBanForUser } = await import('../features/sanctions/infra/sqliteSanctions');
			const { getUserBySteamId64 } = await import('../features/users/infra/sqliteUsers');
			const user = getUserBySteamId64(status.steamid64);
			if (user?.id) {
				const ban = getActiveSiteBanForUser({ userId: user.id });
				if (ban) return jsonError('site_banned', 403);
			}
		}

		return null;
	} catch {
		return null;
	}
}

export function withApiGuards<TArgs extends unknown[]>(
	handler: RouteHandler<TArgs>,
	options: ApiLoggingOptions
): RouteHandler<TArgs> {
	return withApiLogging(async (request: NextRequest, ...args: TArgs) => {
		return (
			enforceSameOriginForAdminMutations(request) ??
			(await enforceSteamGatesForApi(request)) ??
			(await handler(request, ...args))
		);
	}, options);
}
