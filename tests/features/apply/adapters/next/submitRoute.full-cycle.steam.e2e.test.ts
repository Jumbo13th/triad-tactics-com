import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
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
		name: 'Test User',
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

function startNextDevServer(opts: { port: number; env: Record<string, string> }) {
	const nextBin = require.resolve('next/dist/bin/next');
	const child = spawn(
		process.execPath,
		[nextBin, 'dev', '-p', String(opts.port), '-H', '127.0.0.1'],
		{
			cwd: process.cwd(),
			env: {
				...process.env,
				...opts.env,
				NEXT_TELEMETRY_DISABLED: '1'
			},
			stdio: 'pipe'
		}
	);

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

let baseUrl = '';
let serverProcess: ChildProcessWithoutNullStreams | null = null;
let stopServer: (() => Promise<void>) | null = null;
let dbPathForE2e = '';

describe('Apply workflow: submit route (e2e over HTTP)', () => {
	beforeAll(async () => {
		const steamWebApiKey = requireEnv('STEAM_WEB_API_KEY');

		const ts = new Date().toISOString().replace(/[:.]/g, '-');
		const dbPath = path.join(os.tmpdir(), `triad-tactics-e2e-${ts}.db`);
		dbPathForE2e = dbPath;
		process.env.DB_PATH = dbPathForE2e;
		vi.resetModules();

		const port = await getAvailablePort();
		baseUrl = `http://127.0.0.1:${port}`;

		const { child, stop } = startNextDevServer({
			port,
			env: {
				DB_PATH: dbPathForE2e,
				DISABLE_RATE_LIMITS: 'true',
				STEAM_WEB_API_KEY: steamWebApiKey
			}
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
