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
	return { type: typeof error, value: error };
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

	proc.on('warning', (warning: { name?: string; message?: string; stack?: string }) => {
		log('warn', 'process_warning', {
			warning: { name: warning.name, message: warning.message, stack: warning.stack }
		});
	});
}
