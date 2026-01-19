import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applicationSchema } from '@/features/apply/schema';
import { checkCallsign } from '@/features/callsign/useCases/checkCallsign';
import { callsignDeps } from '@/features/callsign/deps';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getSteamIdentity } from '@/features/steamAuth/useCases/getSteamIdentity';
import { dbOperations } from '@/platform/db';
import { errorToLogObject, logger } from '@/platform/logger';

const renameRequestSchema = z.object({
	callsign: applicationSchema.shape.callsign
});

export async function postRenameRequestRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const sid = request.cookies.get(STEAM_SESSION_COOKIE)?.value ?? null;
		const identity = getSteamIdentity(steamAuthDeps, sid);
		if (!identity.connected) {
			return NextResponse.json({ ok: false, error: 'not_authenticated' }, { status: 401 });
		}

		const body: unknown = await request.json();
		const parsed = renameRequestSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
		}

		const ensured = dbOperations.getOrCreateUserBySteamId64({
			steamid64: identity.steamid64
		});
		if (!ensured.success) {
			return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
		}

		const userId = ensured.user.id;
		if (dbOperations.hasPendingRenameRequestByUserId(userId)) {
			return NextResponse.json({ ok: true, status: 'already_pending' }, { status: 200 });
		}

		// Block requests for callsigns that already exist (exact-match normalization).
		const conflict = checkCallsign(callsignDeps, { callsign: parsed.data.callsign });
		if (conflict.ok && conflict.exactMatches.length > 0) {
			return NextResponse.json({ ok: false, error: 'callsign_taken' }, { status: 409 });
		}

		const created = dbOperations.createRenameRequest({
			userId,
			newCallsign: parsed.data.callsign
		});

		if (created.success) {
			return NextResponse.json(
				{ ok: true, status: 'created', requestId: created.id },
				{ status: 200 }
			);
		}

		switch (created.error) {
			case 'rename_not_required':
				return NextResponse.json({ ok: false, error: 'rename_not_required' }, { status: 400 });
			case 'duplicate_pending':
				return NextResponse.json({ ok: false, error: 'duplicate_pending' }, { status: 409 });
			case 'not_found':
				return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
			default:
				return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
		}
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'rename_request_route_failed');
		return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
	}
}
