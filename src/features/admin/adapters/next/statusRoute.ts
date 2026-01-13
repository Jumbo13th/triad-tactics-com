import { NextRequest, NextResponse } from 'next/server';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getSteamIdentity } from '@/features/steamAuth/useCases/getSteamIdentity';
import { isAdminSteamId } from '@/platform/admin';

export async function getAdminStatusRoute(request: NextRequest): Promise<NextResponse> {
	const sid = request.cookies.get(STEAM_SESSION_COOKIE)?.value ?? null;
	const identity = getSteamIdentity(steamAuthDeps, sid);
	if (!identity.connected) {
		return NextResponse.json({ connected: false, isAdmin: false });
	}

	return NextResponse.json({
		connected: true,
		steamid64: identity.steamid64,
		personaName: identity.personaName,
		isAdmin: isAdminSteamId(identity.steamid64)
	});
}
