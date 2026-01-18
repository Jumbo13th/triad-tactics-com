import { NextRequest, NextResponse } from 'next/server';
import { searchCallsign } from '@/features/callsign/useCases/searchCallsign';
import { callsignDeps } from '@/features/callsign/deps';
import { errorToLogObject, logger } from '@/platform/logger';

export async function getSearchCallsignRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const q = request.nextUrl.searchParams.get('q');
		const result = searchCallsign(callsignDeps, { query: q });
		if (!result.ok) {
			return NextResponse.json(result, { status: result.error === 'invalid_request' ? 400 : 500 });
		}
		return NextResponse.json(result, { status: 200 });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'callsign_search_failed');
		return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
	}
}
