import { NextRequest, NextResponse } from 'next/server';
import { errorToLogObject, logger } from '@/platform/logger';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getUserStatus } from '@/features/users/useCases/getUserStatus';
import { getUserSanctions } from '@/features/sanctions/useCases/getUserSanctions';
import { getUserSanctionsDeps } from '@/features/sanctions/deps';

export async function getUserSanctionsRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const sid = request.cookies.get(STEAM_SESSION_COOKIE)?.value ?? null;
		const status = getUserStatus(steamAuthDeps, sid);
		if (!status.connected) {
			return NextResponse.json({ error: 'steam_not_logged_in' }, { status: 401 });
		}

		const { getUserBySteamId64 } = await import('@/features/users/infra/sqliteUsers');
		const user = getUserBySteamId64(status.steamid64);
		if (!user?.id) {
			return NextResponse.json({ success: true, sanctions: [] });
		}

		const sanctions = getUserSanctions(getUserSanctionsDeps, { userId: user.id });
		return NextResponse.json({ success: true, sanctions });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'user_sanctions_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
