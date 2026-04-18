import { NextRequest, NextResponse } from 'next/server';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getSteamIdentity, type SteamIdentityResult } from '@/features/steamAuth/useCases/getSteamIdentity';
import { isAdminSteamId } from '@/platform/admin';

type ConnectedIdentity = Extract<SteamIdentityResult, { connected: true }>;

export type UnitRouteContext = {
	params: Promise<{ unitId: string }>;
};

export function requireConnectedUser(request: NextRequest):
	| { ok: true; identity: ConnectedIdentity; isAdmin: boolean }
	| { ok: false; response: NextResponse } {
	const sid = request.cookies.get(STEAM_SESSION_COOKIE)?.value ?? null;
	const identity = getSteamIdentity(steamAuthDeps, sid);
	if (!identity.connected) {
		return { ok: false, response: NextResponse.json({ error: 'steam_not_logged_in' }, { status: 401 }) };
	}
	return { ok: true, identity, isAdmin: isAdminSteamId(identity.steamid64) };
}

export function getOptionalSteamId64(request: NextRequest): string | null {
	const sid = request.cookies.get(STEAM_SESSION_COOKIE)?.value ?? null;
	const identity = getSteamIdentity(steamAuthDeps, sid);
	return identity.connected ? identity.steamid64 : null;
}

export async function readUnitId(context: UnitRouteContext): Promise<number | null> {
	const { unitId } = await context.params;
	const parsed = parseInt(unitId, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
