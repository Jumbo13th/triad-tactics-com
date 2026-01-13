import { NextRequest, NextResponse } from 'next/server';
import { listApplications } from '@/features/admin/useCases/listApplications';
import { listApplicationsDeps } from '@/features/admin/deps';
import { errorToLogObject, logger } from '@/platform/logger';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getSteamIdentity } from '@/features/steamAuth/useCases/getSteamIdentity';
import { isAdminConfigured, isAdminSteamId } from '@/platform/admin';

export async function getAdminApplicationsRoute(request: NextRequest): Promise<NextResponse> {
	try {
		if (!isAdminConfigured()) {
			return NextResponse.json({ error: 'admin_not_configured' }, { status: 500 });
		}

		const sid = request.cookies.get(STEAM_SESSION_COOKIE)?.value ?? null;
		const identity = getSteamIdentity(steamAuthDeps, sid);
		if (!identity.connected) {
			return NextResponse.json({ error: 'steam_not_logged_in' }, { status: 401 });
		}
		if (!isAdminSteamId(identity.steamid64)) {
			return NextResponse.json({ error: 'forbidden' }, { status: 403 });
		}

		const { applications } = listApplications(listApplicationsDeps);
		return NextResponse.json({
			success: true,
			count: applications.length,
			applications
		});
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_list_applications_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
