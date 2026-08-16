import os from 'node:os';
import path from 'node:path';
import { dbOperations, type DbOperations } from './dbOperations';

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

	// .env.local (loaded after .env.test.local, which doesn't define the Discord
	// keys) carries the REAL bot token — with it live, any test that publishes a
	// mission or posts a mission update sends a real message to the community
	// Discord. Blank it here so no test can ever reach Discord; runs before the
	// dynamic route imports, so @/platform/env picks up the blank value.
	process.env.DISCORD_BOT_TOKEN = '';
	process.env.DISCORD_CONFIRMED_ROLE_ID = '';

	if (opts.disableRateLimits ?? true) {
		process.env.DISABLE_RATE_LIMITS = 'true';
	}

	if (typeof opts.adminSteamIds === 'string' && opts.adminSteamIds.length > 0) {
		process.env.ADMIN_STEAM_IDS = opts.adminSteamIds;
	}

	dbOperations.clearAll();

	return { dbPath, dbOperations };
}
