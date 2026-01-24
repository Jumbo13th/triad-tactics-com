import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import net from 'node:net';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);

export type NextProcess = {
	child: ChildProcessWithoutNullStreams;
	output: { stdout: string[]; stderr: string[] };
	stop: () => Promise<void>;
};

export function getE2eDistDir(testFileUrl: string, opts?: { name?: string }): string {
	if (opts?.name) {
		const slug = opts.name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/(^-+)|(-+$)/g, '')
			.slice(0, 60);
		return `./.next-e2e/${slug || 'e2e'}`;
	}

	const hash = createHash('sha1').update(testFileUrl).digest('hex').slice(0, 12);
	return `./.next-e2e/${hash}`;
}

export async function getAvailablePort(): Promise<number> {
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

export async function waitForHttp(baseUrl: string, timeoutMs: number): Promise<void> {
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

export function spawnNext(args: string[], opts: { env: Record<string, string> }): NextProcess {
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

export async function runNextBuild(opts: { env: Record<string, string> }) {
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

export function startNextProdServer(opts: { port: number; env: Record<string, string> }): NextProcess {
	return spawnNext(['start', '-p', String(opts.port), '-H', '127.0.0.1'], { env: opts.env });
}
