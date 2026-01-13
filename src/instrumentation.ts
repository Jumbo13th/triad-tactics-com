// Note: Next.js also builds an "Edge Instrumentation" bundle.
// This file must be Edge-compatible at build time and runtime.
// That means:
// - no static imports of Node-only modules (like pino)
// - no direct references to Node globals (like `process`)
// - no dynamic code evaluation (e.g. `new Function`, `eval`), which Edge forbids

type ProcessLike = {
	env?: Record<string, string | undefined>;
	on?: (event: string, listener: (...args: unknown[]) => void) => unknown;
};

function getProcessLike(): ProcessLike | undefined {
	return (globalThis as unknown as Record<string, unknown>)['process'] as
		| ProcessLike
		| undefined;
}

function getNextRuntime(): string | undefined {
	return getProcessLike()?.env?.NEXT_RUNTIME;
}

let installed = false;

function errorToPlainObject(error: unknown): unknown {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack
		};
	}

	if (typeof error === 'string') return { message: error };
	if (typeof error === 'bigint') return { type: 'bigint', value: error.toString() };
	if (typeof error === 'number' || typeof error === 'boolean') return { type: typeof error, value: error };
	if (typeof error === 'undefined') return { type: 'undefined', value: 'undefined' };
	if (error === null) return { type: 'null', value: 'null' };
	if (typeof error === 'symbol') return { type: 'symbol', value: String(error) };
	if (typeof error === 'function') {
		const fn = error as (...args: unknown[]) => unknown;
		return { type: 'function', value: `[Function${fn.name ? ` ${fn.name}` : ''}]` };
	}

	if (typeof error === 'object') {
		try {
			const seen = new WeakSet<object>();
			const json = JSON.stringify(error, (_key, value: unknown) => {
				if (typeof value === 'bigint') return value.toString();
				if (typeof value === 'symbol') return String(value);
				if (typeof value === 'function') {
					const fn = value as (...args: unknown[]) => unknown;
					return `[Function${fn.name ? ` ${fn.name}` : ''}]`;
				}
				if (value && typeof value === 'object') {
					const obj = value as object;
					if (seen.has(obj)) return '[Circular]';
					seen.add(obj);
				}
				return value as unknown;
			});

			if (json === undefined) {
				return { type: 'object', value: String(error) };
			}

			// Prefer a structured object when possible; otherwise keep the JSON string.
			try {
				return { type: 'object', value: JSON.parse(json) as unknown };
			} catch {
				return { type: 'object', value: json };
			}
		} catch {
			return { type: 'object', value: String(error) };
		}
	}

	return { type: typeof error, value: String(error) };
}

function warningToSafeObject(warning: unknown): { name?: string; message?: string; stack?: string } {
	if (warning instanceof Error) {
		return { name: warning.name, message: warning.message, stack: warning.stack };
	}

	if (warning && typeof warning === 'object') {
		const maybe = warning as { name?: unknown; message?: unknown; stack?: unknown };
		const name = typeof maybe.name === 'string' ? maybe.name : undefined;
		const message = typeof maybe.message === 'string' ? maybe.message : undefined;
		const stack = typeof maybe.stack === 'string' ? maybe.stack : undefined;
		return { name, message, stack };
	}

	if (typeof warning === 'string') return { message: warning };
	return {};
}

function log(level: 'fatal' | 'warn', msg: string, extra?: Record<string, unknown>): void {
	const payload = {
		level,
		msg,
		time: new Date().toISOString(),
		...(extra ?? {})
	};

	const line = JSON.stringify(payload);
	if (level === 'fatal') console.error(line);
	else console.warn(line);
}

// Next.js will call this once per server instance.
export async function register(): Promise<void> {
	const runtime = getNextRuntime();
	if (runtime && runtime !== 'nodejs') return;

	const proc = getProcessLike();
	if (!proc?.on) return;
	if (installed) return;
	installed = true;

	proc.on('unhandledRejection', (reason: unknown) => {
		log('fatal', 'process_unhandled_rejection', { err: errorToPlainObject(reason) });
	});

	proc.on('uncaughtException', (error: unknown) => {
		log('fatal', 'process_uncaught_exception', { err: errorToPlainObject(error) });
		// Do not call exit here; runtime may be managed.
	});

	proc.on('warning', (...args: unknown[]) => {
		log('warn', 'process_warning', {
			warning: warningToSafeObject(args[0])
		});
	});
}
