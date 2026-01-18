import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, markRateLimit } from '@/platform/rateLimit';
import { DISABLE_RATE_LIMITS, RATE_LIMIT_WINDOW_SECONDS } from '@/platform/config';
import { STEAM_WEB_API_KEY } from '@/platform/env';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { submitApplication } from '@/features/apply/useCases/submitApplication';
import { submitApplicationDeps } from '@/features/apply/deps';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getSteamIdentity } from '@/features/steamAuth/useCases/getSteamIdentity';
import { errorToLogObject, logger } from '@/platform/logger';

function localeFromAcceptLanguage(header: string | null): string {
	if (!header) return 'en';
	const first = header.split(',')[0]?.trim();
	if (!first) return 'en';
	return first.split('-')[0]?.trim().toLowerCase() || 'en';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export async function postSubmitApplicationRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const sid = request.cookies.get(STEAM_SESSION_COOKIE)?.value;
		const identity = getSteamIdentity(steamAuthDeps, sid ?? null);
		if (!identity.connected) {
			return NextResponse.json({ error: 'steam_required' }, { status: 401 });
		}

		const body: unknown = await request.json();
		const steamid64 = identity.connected ? identity.steamid64 : null;
		const personaName = identity.connected ? identity.personaName : null;

		const forwardedFor = request.headers.get('x-forwarded-for');
		const ip =
			forwardedFor?.split(',')[0]?.trim() ||
			request.headers.get('x-real-ip') ||
			'unknown';

		const bypassRateLimit = DISABLE_RATE_LIMITS;
		const rateLimitDecisionRaw = bypassRateLimit
			? { allowed: true as const }
			: checkRateLimit(ip, RATE_LIMIT_WINDOW_SECONDS);
		const rateLimitDecision = rateLimitDecisionRaw.allowed
			? { allowed: true as const, retryAfterSeconds: 0 }
			: rateLimitDecisionRaw;

		const result = await submitApplication(submitApplicationDeps, {
			body,
			steam: { steamid64, personaName },
			ipAddress: ip,
			localeHint:
				(isRecord(body) ? body.locale : undefined) ??
				localeFromAcceptLanguage(request.headers.get('accept-language')),
			steamWebApiKey: STEAM_WEB_API_KEY,
			bypassRateLimit,
			rateLimitDecision,
			markRateLimited: () => markRateLimit(ip)
		});

		return NextResponse.json(result.json, { status: result.status });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'submit_application_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
