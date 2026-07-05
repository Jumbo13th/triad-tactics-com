import { NextRequest, NextResponse } from 'next/server';
import { checkCallsign } from '@/features/callsign/useCases/checkCallsign';
import { callsignDeps } from '@/features/callsign/deps';
import { errorToLogObject, logger } from '@/platform/logger';
import { consumeFixedWindowRateLimit } from '@/platform/rateLimit';
import { getClientIp } from '@/platform/net/clientIp';
import {
	CALLSIGN_CHECK_RATE_LIMIT_MAX_REQUESTS,
	CALLSIGN_CHECK_RATE_LIMIT_WINDOW_SECONDS,
	DISABLE_RATE_LIMITS
} from '@/platform/config';

export async function getCheckCallsignRoute(request: NextRequest): Promise<NextResponse> {
	try {
		if (!DISABLE_RATE_LIMITS) {
			const ip = getClientIp(request);
			const decision = consumeFixedWindowRateLimit(
				`callsign_check:${ip}`,
				CALLSIGN_CHECK_RATE_LIMIT_WINDOW_SECONDS,
				CALLSIGN_CHECK_RATE_LIMIT_MAX_REQUESTS
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

		const callsign = request.nextUrl.searchParams.get('callsign');
		const result = checkCallsign(callsignDeps, { callsign });
		if (!result.ok) {
			return NextResponse.json(result, { status: result.error === 'invalid_request' ? 400 : 500 });
		}
		const res = NextResponse.json(result, { status: 200 });
		res.headers.set('cache-control', 'public, max-age=5, stale-while-revalidate=30');
		return res;
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'callsign_check_failed');
		return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
	}
}
