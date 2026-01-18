import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing env var ${name}`);
	}
	return value;
}

function buildApplicationPayload(locale: string) {
	return {
		callsign: 'Test_User',
		name: 'Test Name',
		age: '25',
		email: 'test@example.com',
		city: 'Test City',
		country: 'Test Country',
		availability: 'Weekends and evenings',
		timezone: 'UTC+02:00',
		experience: 'I have experience with milsim communities and moderation.',
		motivation: 'I want to help the community and contribute in a positive way.',
		locale
	};
}

async function getAvailablePort(): Promise<number> {
	return await new Promise((resolve, reject) => {
		const server = net.createServer();
		server.unref();
		server.on('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			server.close(() => {
				if (!address || typeof address === 'string') {
					reject(new Error('Unable to allocate a TCP port'));
					return;
				}
				resolve(address.port);
			});
		});
	});
}

async function waitForHttp(baseUrl: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${baseUrl}/`, { redirect: 'manual' });
			res.body?.cancel();
			return;
		} catch {
			await new Promise((r) => setTimeout(r, 250));
		}
	}
	throw new Error(`Timed out waiting for server at ${baseUrl}`);
}

function spawnNext(
	args: string[],
	opts: { env: Record<string, string> }
): { child: ChildProcessWithoutNullStreams; output: { stdout: string[]; stderr: string[] }; stop: () => Promise<void> } {
	const nextBin = require.resolve('next/dist/bin/next');
	const child = spawn(process.execPath, [nextBin, ...args], {
		cwd: process.cwd(),
		env: {
			...process.env,
			...opts.env,
			NEXT_TELEMETRY_DISABLED: '1'
		},
		stdio: 'pipe'
	});

	const output: { stdout: string[]; stderr: string[] } = { stdout: [], stderr: [] };
	child.stdout.setEncoding('utf8');
	child.stderr.setEncoding('utf8');
	child.stdout.on('data', (d: string) => output.stdout.push(d));
	child.stderr.on('data', (d: string) => output.stderr.push(d));

	const stop = async () => {
		if (child.killed) return;

		if (process.platform === 'win32') {
			try {
				const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
					stdio: 'ignore'
				});
				await new Promise<void>((resolve) => killer.on('close', () => resolve()));
			} catch {
				child.kill();
			}
			return;
		}

		child.kill('SIGTERM');
	};

	return { child, output, stop };
}

async function runNextBuild(opts: { env: Record<string, string> }) {
	const { child, output, stop } = spawnNext(['build'], { env: opts.env });

	const exitCode = await new Promise<number>((resolve, reject) => {
		child.on('error', reject);
		child.on('close', (code) => resolve(code ?? 1));
	});

	if (exitCode !== 0) {
		await stop();
		throw new Error(
			[
				`next build failed with exit code ${exitCode}`,
				'--- stdout ---',
				...output.stdout,
				'--- stderr ---',
				...output.stderr
			].join('')
		);
	}
}

function startNextProdServer(opts: { port: number; env: Record<string, string> }) {
	return spawnNext(['start', '-p', String(opts.port), '-H', '127.0.0.1'], { env: opts.env });
}

let baseUrl = '';
let serverProcess: ChildProcessWithoutNullStreams | null = null;
let stopServer: (() => Promise<void>) | null = null;
let dbPathForE2e = '';
let distDirForE2e = '';
let originalTsconfigJson: string | null = null;
let originalNextEnvDts: string | null = null;

describe('Apply workflow: submit route (e2e over HTTP)', () => {
	beforeAll(async () => {
		const steamWebApiKey = requireEnv('STEAM_WEB_API_KEY');

		// Next may auto-adjust tsconfig/next-env based on NEXT_DIST_DIR during build.
		// Snapshot and restore to avoid timestamp churn in git-tracked files.
		try {
			originalTsconfigJson = await fs.readFile(path.join(process.cwd(), 'tsconfig.json'), 'utf8');
		} catch {
			originalTsconfigJson = null;
		}
		try {
			originalNextEnvDts = await fs.readFile(path.join(process.cwd(), 'next-env.d.ts'), 'utf8');
		} catch {
			originalNextEnvDts = null;
		}

			// Ensure we don't keep stale generated route types from previous runs.
			// The e2e suite builds into a custom distDir, but tsconfig may still include
			// the default .next folder if it exists.
			try {
				await fs.rm(path.join(process.cwd(), '.next'), { recursive: true, force: true });
			} catch {
			}

		const ts = new Date().toISOString().replace(/[:.]/g, '-');
		const dbPath = path.join(os.tmpdir(), `triad-tactics-e2e-${ts}.db`);
		dbPathForE2e = dbPath;
		process.env.DB_PATH = dbPathForE2e;
		distDirForE2e = path.join('.next-e2e', ts);
		vi.resetModules();

		const port = await getAvailablePort();
		baseUrl = `http://127.0.0.1:${port}`;

		const commonEnv = {
			DB_PATH: dbPathForE2e,
			DISABLE_RATE_LIMITS: 'true',
			STEAM_WEB_API_KEY: steamWebApiKey,
			NEXT_DIST_DIR: distDirForE2e
		};

		await runNextBuild({ env: commonEnv });

		// Restore config files after build to keep working tree clean.
		try {
			if (originalTsconfigJson !== null) {
				await fs.writeFile(path.join(process.cwd(), 'tsconfig.json'), originalTsconfigJson, 'utf8');
			}
		} catch {
		}
		try {
			if (originalNextEnvDts !== null) {
				await fs.writeFile(path.join(process.cwd(), 'next-env.d.ts'), originalNextEnvDts, 'utf8');
			}
		} catch {
		}

		const { child, stop } = startNextProdServer({
			port,
			env: commonEnv
		});

		serverProcess = child;
		stopServer = stop;

		await waitForHttp(baseUrl, 60_000);
	}, 60_000);

	afterAll(async () => {
		// Best-effort restore in case build/start mutated them later.
		try {
			if (originalTsconfigJson !== null) {
				await fs.writeFile(path.join(process.cwd(), 'tsconfig.json'), originalTsconfigJson, 'utf8');
			}
		} catch {
		}
		try {
			if (originalNextEnvDts !== null) {
				await fs.writeFile(path.join(process.cwd(), 'next-env.d.ts'), originalNextEnvDts, 'utf8');
			}
		} catch {
		}

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
			const { dbOperations } = await import('@/platform/db');
			const sessionId = crypto.randomUUID();
			dbOperations.createSteamSession({ id: sessionId, redirect_path: '/en/apply' });
			dbOperations.setSteamSessionIdentity(sessionId, {
				steamid64,
				persona_name: 'Test Persona'
			});
			dbOperations.deleteBySteamId64(steamid64);

			const res = await fetch(`${baseUrl}/api/submit`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					cookie: `tt_steam_session=${sessionId}`,
					'x-forwarded-for': '203.0.113.210'
				},
				body: JSON.stringify(buildApplicationPayload('en'))
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
		'returns steam_not_connected end-to-end when no Steam session cookie is provided',
		async () => {
			const res = await fetch(`${baseUrl}/api/submit`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-forwarded-for': '203.0.113.211'
				},
				body: JSON.stringify(buildApplicationPayload('en'))
			});

			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json.error).toBe('steam_not_connected');
		},
		30_000
	);
});
