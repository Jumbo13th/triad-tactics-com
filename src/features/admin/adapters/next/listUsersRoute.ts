import { NextRequest, NextResponse } from 'next/server';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getSteamIdentity } from '@/features/steamAuth/useCases/getSteamIdentity';
import { isAdminConfigured, isAdminSteamId } from '@/platform/admin';
import { errorToLogObject, logger } from '@/platform/logger';
import { listUsers } from '@/features/admin/useCases/listUsers';
import { listUsersDeps } from '@/features/admin/deps';

function normalizeStatus(value: string | null): 'all' | 'rename_required' | 'confirmed' {
	if (!value) return 'all';
	const v = value.trim().toLowerCase();
	if (v === 'rename_required' || v === 'rename-required') return 'rename_required';
	if (v === 'confirmed') return 'confirmed';
	return 'all';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function matchesQuery(row: Record<string, unknown>, q: string) {
	const needle = q.trim().toLowerCase();
	if (!needle) return true;
	const fields = [
		row.steamid64,
		row.current_callsign,
		row.id,
		row.confirmed_application_id
	];
	return fields
		.map((v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : ''))
		.some((h) => h.toLowerCase().includes(needle));
}

export async function getAdminUsersRoute(request: NextRequest): Promise<NextResponse> {
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

		const { users: raw, counts } = listUsers(listUsersDeps, { status });
		const users = q.trim()
			? raw.filter((u) => (isRecord(u) ? matchesQuery(u, q) : true))
			: raw;

		return NextResponse.json({
			success: true,
			count: users.length,
			counts,
			users
		});
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_list_users_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
