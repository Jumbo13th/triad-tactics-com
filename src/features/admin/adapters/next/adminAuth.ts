import { NextRequest, NextResponse } from 'next/server';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getSteamIdentity, type SteamIdentityResult } from '@/features/steamAuth/useCases/getSteamIdentity';
import { isAdminConfigured, isAdminSteamId } from '@/platform/admin';

type ConnectedIdentity = Extract<SteamIdentityResult, { connected: true }>;

export type RequireAdminResult =
	| { ok: true; identity: ConnectedIdentity }
	| { ok: false; response: NextResponse };

// Keyed by the request object itself, so only server code holding a request it
// built can attach an identity; nothing arriving over HTTP can reach this map.
const delegatedAdmins = new WeakMap<Request, ConnectedIdentity>();

/**
 * Lets the admin MCP endpoint run an admin route handler in-process on behalf of
 * a token-authenticated admin. The allowlist is still checked by requireAdmin.
 */
export function actAsAdmin(request: Request, steamid64: string): void {
	delegatedAdmins.set(request, { connected: true, steamid64, personaName: null });
}

export function isDelegatedAdminRequest(request: Request): boolean {
	return delegatedAdmins.has(request);
}

export function requireAdmin(request: NextRequest): RequireAdminResult {
	if (!isAdminConfigured()) {
		return { ok: false, response: NextResponse.json({ error: 'admin_not_configured' }, { status: 500 }) };
	}

	const delegated = delegatedAdmins.get(request);
	const sid = request.cookies.get(STEAM_SESSION_COOKIE)?.value ?? null;
	const identity = delegated ?? getSteamIdentity(steamAuthDeps, sid);
	if (!identity.connected) {
		return { ok: false, response: NextResponse.json({ error: 'steam_not_logged_in' }, { status: 401 }) };
	}

	if (!isAdminSteamId(identity.steamid64)) {
		return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
	}

	return { ok: true, identity };
}
