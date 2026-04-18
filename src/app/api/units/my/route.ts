import { NextRequest, NextResponse } from 'next/server';
import { withApiGuards } from '@/platform/apiGates';
import { unitDeps } from '@/features/units/deps';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { getSteamIdentity } from '@/features/steamAuth/useCases/getSteamIdentity';
import { steamAuthDeps } from '@/features/steamAuth/deps';

async function getMyUnitRoute(request: NextRequest): Promise<NextResponse> {
	const sid = request.cookies.get(STEAM_SESSION_COOKIE)?.value ?? null;
	const identity = getSteamIdentity(steamAuthDeps, sid);
	if (!identity.connected) {
		return NextResponse.json({ unit: null });
	}

	const user = unitDeps.users.getUserBySteamId64(identity.steamid64);
	if (!user) return NextResponse.json({ unit: null });

	const unit = unitDeps.memberships.getActiveMemberUnit(user.id);
	return NextResponse.json({ unit });
}

export const runtime = 'nodejs';
export const GET = withApiGuards(getMyUnitRoute, { name: 'api.units.my', logSteamId: false });
