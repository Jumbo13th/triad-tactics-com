import { NextRequest } from 'next/server';
import { createRequestId, errorToLogObject, logger } from './logger';
import { runWithRequestContext } from './requestContext';

export type RouteHandler = (request: NextRequest) => Response | Promise<Response>;

function getClientIp(request: NextRequest): string | undefined {
	const forwardedFor = request.headers.get('x-forwarded-for');
	const ip = forwardedFor?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || undefined;
	return ip;
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

	const contentType = response.headers.get('content-type') || '';
	if (!contentType.toLowerCase().includes('application/json')) {
		return { status, location };
	}

	try {
		const cloned = response.clone();
		const text = await cloned.text();
		// Keep logs small and avoid leaking full payloads.
		const trimmed = text.length > 2048 ? `${text.slice(0, 2048)}…` : text;
		return { status, location, errorBody: trimmed };
	} catch {
		return { status, location };
	}
}

export function withApiLogging(
	handler: RouteHandler,
	options: { name: string }
): RouteHandler {
	return async (request: NextRequest) => {
		const startedAt = Date.now();
		const requestId = request.headers.get('x-request-id') || createRequestId();

		const log = logger.child({
			requestId,
			route: options.name,
			method: request.method,
			path: request.nextUrl.pathname,
			ip: getClientIp(request),
			ua: request.headers.get('user-agent') || undefined
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
