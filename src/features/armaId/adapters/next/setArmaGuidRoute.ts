import { NextRequest, NextResponse } from 'next/server';
import { setArmaGuidRequestSchema } from '@/features/armaId/domain/requests';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getSteamIdentity } from '@/features/steamAuth/useCases/getSteamIdentity';
import { setArmaGuidDeps } from '@/features/armaId/deps';
import { setArmaGuid } from '@/features/armaId/useCases/setArmaGuid';
import { errorToLogObject, logger } from '@/platform/logger';

export async function postSetArmaGuidRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const sid = request.cookies.get(STEAM_SESSION_COOKIE)?.value ?? null;
		const identity = getSteamIdentity(steamAuthDeps, sid);
		if (!identity.connected) {
			return NextResponse.json({ ok: false, error: 'not_authenticated' }, { status: 401 });
		}

		const body: unknown = await request.json();
		const parsed = setArmaGuidRequestSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
		}

		const result = setArmaGuid(setArmaGuidDeps, {
			steamid64: identity.steamid64,
			armaGuid: parsed.data.armaGuid
		});

		if (result.ok) {
			return NextResponse.json({ ok: true }, { status: 200 });
		}

		switch (result.error) {
			case 'duplicate':
				return NextResponse.json({ ok: false, error: 'duplicate' }, { status: 409 });
			case 'not_found':
				return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
			default:
				return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
		}
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'set_arma_guid_route_failed');
		return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
	}
}
