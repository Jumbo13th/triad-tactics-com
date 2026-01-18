import { NextRequest } from 'next/server';
import { createRequestId, errorToLogObject, logger } from './logger';
import { runWithRequestContext } from './requestContext';

export type RouteHandler = (request: NextRequest) => Response | Promise<Response>;

export type ApiLoggingOptions = {
	name: string;
	/**
	 * When true, attempts to attach steamid64 (if a Steam session exists)
	 * to the log context for this route.
	 */
	logSteamId?: boolean;
};

function getClientIp(request: NextRequest): string | undefined {
	const forwardedFor = request.headers.get('x-forwarded-for');
	const ip = forwardedFor?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || undefined;
	return ip;
}

function truncate(text: string, maxLen: number): string {
	return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

function isJsonResponse(response: Response): boolean {
	const contentType = response.headers.get('content-type') || '';
	return contentType.toLowerCase().includes('application/json');
}

async function getSteamId64FromSession(request: NextRequest): Promise<string | undefined> {
	// Safety: never try to run DB-backed identity lookups in edge runtime.
	if (process.env.NEXT_RUNTIME === 'edge') return undefined;

	try {
		const { STEAM_SESSION_COOKIE } = await import('../features/steamAuth/sessionCookie');
		const { steamAuthDeps } = await import('../features/steamAuth/deps');
		const { getSteamIdentity } = await import('../features/steamAuth/useCases/getSteamIdentity');
		const sid = request.cookies.get(STEAM_SESSION_COOKIE)?.value ?? null;
		const identity = getSteamIdentity(steamAuthDeps, sid);
		return identity.connected ? identity.steamid64 : undefined;
	} catch {
		return undefined;
	}
}

function safeSetHeader(response: Response, name: string, value: string): void {
	try {
		response.headers.set(name, value);
	} catch {
		// ignore (some runtimes may provide immutable headers)
	}
}

async function summarizeResponseForLog(response: Response): Promise<
	| { status: number; location?: string; errorBody?: string }
	| { status: number; location?: string }
> {
	const status = response.status;
	const location = response.headers.get('location') || undefined;

	// Only attempt to log bodies for error responses.
	if (status < 400) return { status, location };
	if (!isJsonResponse(response)) return { status, location };

	try {
		const cloned = response.clone();
		const text = await cloned.text();
		return { status, location, errorBody: truncate(text, 2048) };
	} catch {
		return { status, location };
	}
}

export function withApiLogging(
	handler: RouteHandler,
	options: ApiLoggingOptions
): RouteHandler {
	return async (request: NextRequest) => {
		const startedAt = Date.now();
		const requestId = request.headers.get('x-request-id') || createRequestId();
		const pathname = request.nextUrl.pathname;
		const steamid64 = options.logSteamId ? await getSteamId64FromSession(request) : undefined;

		const log = logger.child({
			requestId,
			route: options.name,
			method: request.method,
			path: pathname,
			ip: getClientIp(request),
			ua: request.headers.get('user-agent') || undefined,
			steamid64
		});

		log.info('request_start');

		try {
			const response = await runWithRequestContext(
				{ requestId, route: options.name },
				() => handler(request)
			);
			const durationMs = Date.now() - startedAt;

			safeSetHeader(response, 'x-request-id', requestId);
			const summary = await summarizeResponseForLog(response);

			log.info({ ...summary, durationMs }, 'request_end');
			return response;
		} catch (error: unknown) {
			const durationMs = Date.now() - startedAt;
			log.error({ ...errorToLogObject(error), durationMs }, 'request_error');
			throw error;
		}
	};
}
