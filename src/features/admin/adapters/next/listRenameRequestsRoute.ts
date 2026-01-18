import { NextRequest, NextResponse } from 'next/server';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getSteamIdentity } from '@/features/steamAuth/useCases/getSteamIdentity';
import { isAdminConfigured, isAdminSteamId } from '@/platform/admin';
import { errorToLogObject, logger } from '@/platform/logger';
import { listRenameRequests } from '@/features/admin/useCases/listRenameRequests';
import { renameRequestsDeps } from '@/features/admin/deps';

function normalizeStatus(value: string | null): 'pending' | 'approved' | 'declined' | 'all' {
	if (!value) return 'pending';
	const v = value.trim().toLowerCase();
	if (v === 'approved') return 'approved';
	if (v === 'declined') return 'declined';
	if (v === 'all') return 'all';
	return 'pending';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function matchesQuery(row: Record<string, unknown>, q: string) {
	const needle = q.trim().toLowerCase();
	if (!needle) return true;
	const fields = [
		row.steamid64,
		row.old_callsign,
		row.new_callsign,
		row.status,
		row.id,
		row.user_id
	];
	return fields
		.map((v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : ''))
		.some((h) => h.toLowerCase().includes(needle));
}

export async function getAdminRenameRequestsRoute(request: NextRequest): Promise<NextResponse> {
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

		const { renameRequests: raw } = listRenameRequests(renameRequestsDeps, { status });
		const renameRequests = q.trim()
			? raw.filter((r) => (isRecord(r) ? matchesQuery(r, q) : true))
			: raw;

		return NextResponse.json({
			success: true,
			count: renameRequests.length,
			renameRequests
		});
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_list_rename_requests_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
