import { NextRequest, NextResponse } from 'next/server';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getSteamIdentity } from '@/features/steamAuth/useCases/getSteamIdentity';
import { isAdminConfigured, isAdminSteamId } from '@/platform/admin';
import { confirmApplication } from '@/features/admin/useCases/confirmApplication';
import { confirmApplicationDeps } from '@/features/admin/deps';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export async function postConfirmApplicationRoute(request: NextRequest): Promise<NextResponse> {
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
		const applicationIdRaw = isRecord(body) ? body.applicationId : undefined;
		const applicationId = typeof applicationIdRaw === 'number' ? applicationIdRaw : Number(applicationIdRaw);
		if (!Number.isFinite(applicationId) || applicationId <= 0) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const result = confirmApplication(confirmApplicationDeps, {
			applicationId,
			confirmedBySteamId64: identity.steamid64
		});

		if (!result.ok) {
			if (result.error === 'not_found') {
				return NextResponse.json({ error: 'not_found' }, { status: 404 });
			}
			return NextResponse.json({ error: 'server_error' }, { status: 500 });
		}

		return NextResponse.json({ success: true });
	} catch {
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
