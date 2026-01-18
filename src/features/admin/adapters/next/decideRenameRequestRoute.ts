import { NextRequest, NextResponse } from 'next/server';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getSteamIdentity } from '@/features/steamAuth/useCases/getSteamIdentity';
import { isAdminConfigured, isAdminSteamId } from '@/platform/admin';
import { decideRenameRequest } from '@/features/admin/useCases/decideRenameRequest';
import { renameRequestsDeps } from '@/features/admin/deps';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export async function postDecideRenameRequestRoute(request: NextRequest): Promise<NextResponse> {
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
		const requestIdRaw = isRecord(body) ? body.requestId : undefined;
		const requestId = typeof requestIdRaw === 'number' ? requestIdRaw : Number(requestIdRaw);
		if (!Number.isFinite(requestId) || requestId <= 0) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const decisionRaw = isRecord(body) ? body.decision : undefined;
		const decision = typeof decisionRaw === 'string' ? decisionRaw.trim().toLowerCase() : '';
		if (decision !== 'approve' && decision !== 'decline') {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const declineReasonRaw = isRecord(body) ? body.declineReason : undefined;
		const declineReason = typeof declineReasonRaw === 'string' ? declineReasonRaw.trim() : null;

		const result = decideRenameRequest(renameRequestsDeps, {
			requestId,
			decision: decision as 'approve' | 'decline',
			decidedBySteamId64: identity.steamid64,
			declineReason
		});

		if (!result.ok) {
			if (result.error === 'not_found') {
				return NextResponse.json({ error: 'not_found' }, { status: 404 });
			}
			if (result.error === 'not_pending') {
				return NextResponse.json({ error: 'not_pending' }, { status: 409 });
			}
			return NextResponse.json({ error: 'server_error' }, { status: 500 });
		}

		return NextResponse.json({ success: true });
	} catch {
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
