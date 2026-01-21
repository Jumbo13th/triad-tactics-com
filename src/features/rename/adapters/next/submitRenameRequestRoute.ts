import { NextRequest, NextResponse } from 'next/server';
import { renameRequestSchema } from '@/features/rename/domain/requests';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getSteamIdentity } from '@/features/steamAuth/useCases/getSteamIdentity';
import { submitRenameRequestDeps } from '@/features/rename/deps';
import { submitRenameRequest } from '@/features/rename/useCases/submitRenameRequest';
import { errorToLogObject, logger } from '@/platform/logger';

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

		const result = submitRenameRequest(submitRenameRequestDeps, {
			steamid64: identity.steamid64,
			callsign: parsed.data.callsign
		});

		if (result.ok) {
			if (result.status === 'already_pending') {
				return NextResponse.json({ ok: true, status: 'already_pending' }, { status: 200 });
			}
			return NextResponse.json(
				{ ok: true, status: 'created', requestId: result.requestId },
				{ status: 200 }
			);
		}

		switch (result.error) {
			case 'callsign_taken':
				return NextResponse.json({ ok: false, error: 'callsign_taken' }, { status: 409 });
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
