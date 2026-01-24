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
		callsign: (() => {
			// Ensure user exists even if they haven't applied.
			steamAuthDeps.users.upsertUser({ steamid64: identity.steamid64 });
			const user = steamAuthDeps.users.getUserBySteamId64(identity.steamid64);
			return user?.current_callsign ?? null;
		})(),
		isAdmin: isAdminSteamId(identity.steamid64)
	});
}
