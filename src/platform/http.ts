import { errorToLogObject, logger } from './logger';
import { getRequestContext } from './requestContext';

function parseBoolean(value: string | undefined, defaultValue = false): boolean {
	if (value == null) return defaultValue;
	const v = value.trim().toLowerCase();
	return v === '1' || v === 'true' || v === 'yes';
}

const LOG_OUTBOUND_HTTP = parseBoolean(
	process.env.LOG_OUTBOUND_HTTP,
	process.env.NODE_ENV === 'development'
);

const LOG_OUTBOUND_HTTP_BODY = parseBoolean(process.env.LOG_OUTBOUND_HTTP_BODY, false);

export function redactUrl(input: string | URL): string {
	const url = typeof input === 'string' ? new URL(input) : new URL(input.toString());

	// Avoid leaking secrets in querystring.
	const sensitiveKeys = new Set(['key', 'token', 'access_token', 'auth', 'password', 'sig', 'signature']);
	for (const [k] of url.searchParams) {
		if (sensitiveKeys.has(k.toLowerCase())) {
			url.searchParams.set(k, 'REDACTED');
		}
	}

	return url.toString();
}

export async function fetchWithLogging(
	input: string | URL,
	init?: RequestInit,
	options?: { name?: string }
): Promise<Response> {
	if (!LOG_OUTBOUND_HTTP) {
		return fetch(input, init);
	}

	const startedAt = Date.now();
	const ctx = getRequestContext();
	const url = redactUrl(input);
	const method = init?.method || 'GET';

	const log = logger.child({
		requestId: ctx?.requestId,
		route: ctx?.route,
		outbound: options?.name ?? undefined,
		method,
		url
	});

	log.debug('outbound_request_start');
	try {
		const res = await fetch(input, init);
		const durationMs = Date.now() - startedAt;

		if (LOG_OUTBOUND_HTTP_BODY && !res.ok) {
			try {
				const cloned = res.clone();
				const text = await cloned.text();
				const bodySnippet = text.length > 1024 ? `${text.slice(0, 1024)}…` : text;
				log.info({ status: res.status, durationMs, bodySnippet }, 'outbound_request_end');
			} catch {
				log.info({ status: res.status, durationMs }, 'outbound_request_end');
			}
		} else {
			log.info({ status: res.status, durationMs }, 'outbound_request_end');
		}
		return res;
	} catch (error: unknown) {
		const durationMs = Date.now() - startedAt;
		log.warn({ ...errorToLogObject(error), durationMs }, 'outbound_request_error');
		throw error;
	}
}
