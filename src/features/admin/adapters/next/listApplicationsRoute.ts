import { NextRequest, NextResponse } from 'next/server';
import { listApplications } from '@/features/admin/useCases/listApplications';
import { listApplicationsDeps } from '@/features/admin/deps';
import { errorToLogObject, logger } from '@/platform/logger';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getSteamIdentity } from '@/features/steamAuth/useCases/getSteamIdentity';
import { isAdminConfigured, isAdminSteamId } from '@/platform/admin';
import type { Application } from '@/platform/db';

function normalizeStatus(value: string | null): 'active' | 'archived' | 'all' {
	if (!value) return 'active';
	const v = value.trim().toLowerCase();
	if (v === 'archived') return 'archived';
	if (v === 'all') return 'all';
	return 'active';
}

function matchesQuery(app: Application, q: string) {
	const needle = q.trim().toLowerCase();
	if (!needle) return true;
	const callsign = app.answers?.callsign ?? '';
	const name = app.answers?.name ?? '';
	const haystacks = [
		app.email ?? '',
		app.steamid64 ?? '',
		app.persona_name ?? '',
		callsign,
		name
	];
	return haystacks.some((h) => h.toLowerCase().includes(needle));
}

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

		const status = normalizeStatus(request.nextUrl.searchParams.get('status'));
		const q = request.nextUrl.searchParams.get('q') ?? '';

		const { applications: raw, counts } = listApplications(listApplicationsDeps, { status });
		const applications = q.trim() ? raw.filter((a) => matchesQuery(a, q)) : raw;
		return NextResponse.json({
			success: true,
			count: applications.length,
			counts,
			applications
		});
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_list_applications_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
