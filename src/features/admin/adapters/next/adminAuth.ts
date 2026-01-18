import { NextRequest, NextResponse } from 'next/server';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getSteamIdentity, type SteamIdentityResult } from '@/features/steamAuth/useCases/getSteamIdentity';
import { isAdminConfigured, isAdminSteamId } from '@/platform/admin';

type ConnectedIdentity = Extract<SteamIdentityResult, { connected: true }>;

export type RequireAdminResult =
	| { ok: true; identity: ConnectedIdentity }
	| { ok: false; response: NextResponse };

export function requireAdmin(request: NextRequest): RequireAdminResult {
	if (!isAdminConfigured()) {
		return { ok: false, response: NextResponse.json({ error: 'admin_not_configured' }, { status: 500 }) };
	}

	const sid = request.cookies.get(STEAM_SESSION_COOKIE)?.value ?? null;
	const identity = getSteamIdentity(steamAuthDeps, sid);
	if (!identity.connected) {
		return { ok: false, response: NextResponse.json({ error: 'steam_not_logged_in' }, { status: 401 }) };
	}

	if (!isAdminSteamId(identity.steamid64)) {
		return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
	}

	return { ok: true, identity };
}
