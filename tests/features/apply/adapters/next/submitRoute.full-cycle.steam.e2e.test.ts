import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import {
	getAvailablePort,
	getE2eDistDir,
	runNextBuild,
	startNextProdServer,
	waitForHttp
} from '../../../../fixtures/nextE2e';
import { buildApplySubmitPayload } from '../../../../fixtures/applyPayload';
import { createSteamSession } from '../../../../fixtures/steamSession';

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing env var ${name}`);
	}
	return value;
}

let baseUrl = '';
let serverProcess: ChildProcessWithoutNullStreams | null = null;
let stopServer: (() => Promise<void>) | null = null;
let dbPathForE2e = '';
let distDirForE2e = '';

// This suite hits the real Steam Web API. Keep it opt-in so `npm test` works
// without secrets.
const hasSteamEnv = Boolean(process.env.STEAM_WEB_API_KEY && process.env.TEST_STEAMID64_OWNED);
const describeSteam = hasSteamEnv ? describe : describe.skip;

describeSteam('Apply workflow: submit route (e2e over HTTP)', () => {
	beforeAll(async () => {
		const steamWebApiKey = requireEnv('STEAM_WEB_API_KEY');

		const ts = new Date().toISOString().replace(/[:.]/g, '-');
		const dbPath = path.join(os.tmpdir(), `triad-tactics-e2e-${ts}.db`);
		dbPathForE2e = dbPath;
		process.env.DB_PATH = dbPathForE2e;
		distDirForE2e = getE2eDistDir(import.meta.url, { name: 'apply-submit-full-cycle-steam' });
		vi.resetModules();

		// Keep E2E build artifacts isolated and predictable.
		try {
			await fs.rm(path.join(process.cwd(), distDirForE2e), { recursive: true, force: true });
		} catch {
		}

		const port = await getAvailablePort();
		baseUrl = `http://127.0.0.1:${port}`;

		const commonEnv = {
			DB_PATH: dbPathForE2e,
			DISABLE_RATE_LIMITS: 'true',
			STEAM_WEB_API_KEY: steamWebApiKey,
			NEXT_DIST_DIR: distDirForE2e
		};

		await runNextBuild({ env: commonEnv });

		const { child, stop } = startNextProdServer({
			port,
			env: commonEnv
		});

		serverProcess = child;
		stopServer = stop;

		await waitForHttp(baseUrl, 60_000);
	}, 60_000);

	afterAll(async () => {
		if (stopServer) {
			await stopServer();
		}

		if (serverProcess) {
			await new Promise<void>((resolve) => {
				const timeout = setTimeout(() => resolve(), 5_000);
				serverProcess?.on('close', () => {
					clearTimeout(timeout);
					resolve();
				});
			});
		}

		try {
			if (distDirForE2e) {
				await fs.rm(distDirForE2e, { recursive: true, force: true });
			}
		} catch {
		}
		try {
			if (dbPathForE2e) {
				await fs.rm(dbPathForE2e, { force: true });
			}
		} catch {
		}
	}, 30_000);

	it(
		'accepts an owned Steam profile end-to-end (HTTP + cookies + DB + Steam verification)',
		async () => {
			const steamid64 = requireEnv('TEST_STEAMID64_OWNED');
			const { dbOperations } = await import('../../../../fixtures/dbOperations');
			const sessionId = createSteamSession(dbOperations, {
				steamid64,
				redirectPath: '/en/apply',
				personaName: 'Test Persona'
			});
			dbOperations.deleteBySteamId64(steamid64);

			const res = await fetch(`${baseUrl}/api/submit`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					cookie: `tt_steam_session=${sessionId}`,
					'x-forwarded-for': '203.0.113.210'
				},
				body: JSON.stringify(buildApplySubmitPayload({ locale: 'en' }))
			});

			expect(res.status).toBe(201);
			const json = await res.json();
			expect(json.success).toBe(true);

			const row = dbOperations.getBySteamId64(steamid64);
			expect(row?.answers.verified_game_access).toBe(true);
		},
		60_000
	);

	it(
		'returns steam_required end-to-end when no Steam session cookie is provided',
		async () => {
			const res = await fetch(`${baseUrl}/api/submit`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-forwarded-for': '203.0.113.211'
				},
				body: JSON.stringify(buildApplySubmitPayload({ locale: 'en' }))
			});

			expect(res.status).toBe(401);
			const json = await res.json();
			expect(json.error).toBe('steam_required');
		},
		30_000
	);
});
