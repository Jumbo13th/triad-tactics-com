import { NextRequest, NextResponse } from 'next/server';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getSteamIdentity } from '@/features/steamAuth/useCases/getSteamIdentity';
import { isAdminConfigured, isAdminSteamId } from '@/platform/admin';
import { renameRequiredDeps } from '@/features/admin/deps';
import { clearRenameRequired, setRenameRequired } from '@/features/admin/useCases/renameRequired';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export async function postRenameRequiredRoute(request: NextRequest): Promise<NextResponse> {
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

		const body: unknown = await request.json();
		const steamid64Raw = isRecord(body) ? body.steamid64 : undefined;
		const steamid64 = typeof steamid64Raw === 'string' ? steamid64Raw.trim() : '';
		if (!steamid64) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const actionRaw = isRecord(body) ? body.action : undefined;
		const action = typeof actionRaw === 'string' ? actionRaw.trim().toLowerCase() : 'require';
		const reasonRaw = isRecord(body) ? body.reason : undefined;
		const reason = typeof reasonRaw === 'string' ? reasonRaw.trim() : null;

		if (action === 'clear') {
			const result = clearRenameRequired(renameRequiredDeps, { steamid64 });
			if (!result.ok) return NextResponse.json({ error: 'server_error' }, { status: 500 });
			return NextResponse.json({ success: true });
		}

		const result = setRenameRequired(renameRequiredDeps, {
			steamid64,
			requestedBySteamId64: identity.steamid64,
			reason
		});

		if (!result.ok) return NextResponse.json({ error: 'server_error' }, { status: 500 });
		return NextResponse.json({ success: true });
	} catch {
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
