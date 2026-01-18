import { NextRequest, NextResponse } from 'next/server';
import { checkCallsign } from '@/features/callsign/useCases/checkCallsign';
import { callsignDeps } from '@/features/callsign/deps';
import { errorToLogObject, logger } from '@/platform/logger';

export async function getCheckCallsignRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const callsign = request.nextUrl.searchParams.get('callsign');
		const result = checkCallsign(callsignDeps, { callsign });
		if (!result.ok) {
			return NextResponse.json(result, { status: result.error === 'invalid_request' ? 400 : 500 });
		}
		return NextResponse.json(result, { status: 200 });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'callsign_check_failed');
		return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
	}
}
