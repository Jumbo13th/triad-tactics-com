import pino from 'pino';

function parseBoolean(value: string | undefined, defaultValue = false): boolean {
	if (value == null) return defaultValue;
	const v = value.trim().toLowerCase();
	return v === '1' || v === 'true' || v === 'yes';
}

function createRequestIdFallback(): string {
	return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createRequestId(): string {
	const uuid = globalThis.crypto?.randomUUID?.();
	return uuid ?? createRequestIdFallback();
}

export function errorToLogObject(error: unknown): { err: unknown } {
	if (error instanceof Error) {
		return { err: error };
	}

	// Keep it JSON-serializable and predictable.
	return {
		err: {
			type: typeof error,
			message: typeof error === 'string' ? error : 'non_error_thrown',
			value: typeof error === 'string' ? undefined : error
		}
	};
}

const serviceName = process.env.LOG_SERVICE ?? 'triad-tactics-com';

const defaultLevel =
	process.env.NODE_ENV === 'production'
		? 'info'
		: process.env.NODE_ENV === 'test'
			? 'silent'
			: 'debug';

const level = process.env.LOG_LEVEL ?? defaultLevel;

const pretty = parseBoolean(
	process.env.LOG_PRETTY,
	process.env.NODE_ENV === 'development'
);

export const logger = pino({
	level,
	base: { service: serviceName },
	transport: pretty
		? {
			target: 'pino-pretty',
			options: {
				colorize: true,
				translateTime: 'SYS:standard',
				ignore: 'pid,hostname'
			}
		}
		: undefined
});
