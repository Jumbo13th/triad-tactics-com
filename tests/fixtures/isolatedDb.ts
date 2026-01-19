import os from 'node:os';
import path from 'node:path';

export type DbOperations = typeof import('@/platform/db').dbOperations;

export type SetupIsolatedDbOptions = {
	prefix: string;
	disableRateLimits?: boolean;
	adminSteamIds?: string;
};

export async function setupIsolatedDb(
	prefixOrOptions: string | SetupIsolatedDbOptions
): Promise<{ dbPath: string; dbOperations: DbOperations }> {
	const opts: SetupIsolatedDbOptions =
		typeof prefixOrOptions === 'string' ? { prefix: prefixOrOptions } : prefixOrOptions;

	const ts = new Date().toISOString().replace(/[:.]/g, '-');
	const dbPath = path.join(os.tmpdir(), `${opts.prefix}-${ts}-${crypto.randomUUID()}.db`);
	process.env.DB_PATH = dbPath;

	if (opts.disableRateLimits ?? true) {
		process.env.DISABLE_RATE_LIMITS = 'true';
	}

	if (typeof opts.adminSteamIds === 'string' && opts.adminSteamIds.length > 0) {
		process.env.ADMIN_STEAM_IDS = opts.adminSteamIds;
	}

	const { dbOperations } = await import('@/platform/db');
	dbOperations.clearAll();

	return { dbPath, dbOperations };
}
