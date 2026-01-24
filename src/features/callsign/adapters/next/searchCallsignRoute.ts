import { NextRequest, NextResponse } from 'next/server';
import { searchCallsign } from '@/features/callsign/useCases/searchCallsign';
import { callsignDeps } from '@/features/callsign/deps';
import { errorToLogObject, logger } from '@/platform/logger';
import { consumeFixedWindowRateLimit } from '@/platform/rateLimit';
import {
	CALLSIGN_SEARCH_RATE_LIMIT_MAX_REQUESTS,
	CALLSIGN_SEARCH_RATE_LIMIT_WINDOW_SECONDS,
	DISABLE_RATE_LIMITS
} from '@/platform/config';

function getClientIp(request: NextRequest): string {
	const forwardedFor = request.headers.get('x-forwarded-for');
	return forwardedFor?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

export async function getSearchCallsignRoute(request: NextRequest): Promise<NextResponse> {
	try {
		if (!DISABLE_RATE_LIMITS) {
			const ip = getClientIp(request);
			const decision = consumeFixedWindowRateLimit(
				`callsign_search:${ip}`,
				CALLSIGN_SEARCH_RATE_LIMIT_WINDOW_SECONDS,
				CALLSIGN_SEARCH_RATE_LIMIT_MAX_REQUESTS
			);
			if (!decision.allowed) {
				const res = NextResponse.json(
					{ ok: false, error: 'rate_limited', retryAfterSeconds: decision.retryAfterSeconds },
					{ status: 429 }
				);
				res.headers.set('retry-after', String(decision.retryAfterSeconds));
				return res;
			}
		}

		const q = request.nextUrl.searchParams.get('q');
		const result = searchCallsign(callsignDeps, { query: q });
		if (!result.ok) {
			return NextResponse.json(result, { status: result.error === 'invalid_request' ? 400 : 500 });
		}
		const res = NextResponse.json(result, { status: 200 });
		res.headers.set('cache-control', 'public, max-age=5, stale-while-revalidate=30');
		return res;
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'callsign_search_failed');
		return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
	}
}
