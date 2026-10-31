import { createHash, createHmac } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import type { NextRequest } from 'next/server';

// Helpers for the ll-upload/1 receiver and the replay pages: requests signed the way the
// host service signs them, test files cut into pieces, and a stand-in S3 store.

export const UPLOAD_SECRET = 'replay-upload-secret-of-at-least-32-characters';
export const SERVER = 'server-1';
export const SESSION = '20261031-201500-eden';

export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

export type SignOptions = {
	timestamp?: number;
	server?: string;
	secret?: string;
	signedPath?: string;
	contentSha256?: string;
	contentLength?: string | null;
};

/** Signed independently of the receiver, from the protocol text. */
export function signedRequest(
	RequestClass: typeof NextRequest,
	method: 'GET' | 'PUT' | 'POST',
	urlPath: string,
	body?: Buffer,
	options: SignOptions = {}
): NextRequest {
	const payload = body ?? Buffer.alloc(0);
	const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
	const contentSha256 = options.contentSha256 ?? sha256(payload);
	const canonical = `${method}\n${options.signedPath ?? urlPath}\n${timestamp}\n${contentSha256}`;
	const headers: Record<string, string> = {
		'x-ll-server': options.server ?? SERVER,
		'x-ll-timestamp': timestamp,
		'x-ll-content-sha256': contentSha256,
		'x-ll-signature': createHmac('sha256', options.secret ?? UPLOAD_SECRET).update(canonical).digest('hex'),
	};
	if (method !== 'GET') {
		const length = options.contentLength === undefined ? String(payload.length) : options.contentLength;
		if (length !== null) headers['content-length'] = length;
		headers['content-type'] = urlPath.includes('/pieces/') ? 'application/octet-stream' : 'application/json';
	}
	return new RequestClass(`http://localhost/api/replays/v1${urlPath}`, {
		method,
		headers,
		body: method === 'GET' ? undefined : new Uint8Array(payload),
	});
}

export type TestFile = {
	sha256: string;
	size: number;
	encoded: Buffer;
	encodedSha256: string;
	pieces: Buffer[];
};

/** The receiver joins whatever pieces it gets, so small files cut anywhere stand in for 1.5 MB pieces. */
export function buildFile(content: string, pieceCount: number): TestFile {
	const raw = Buffer.from(content, 'utf8');
	const encoded = gzipSync(raw);
	const step = Math.ceil(encoded.length / pieceCount);
	const pieces = Array.from({ length: pieceCount }, (_, i) => encoded.subarray(i * step, (i + 1) * step));
	return { sha256: sha256(raw), size: raw.length, encoded, encodedSha256: sha256(encoded), pieces };
}

export function segmentContent(segment: number, mission = 'Operation Example'): string {
	return [
		'LLR 1',
		`H session ${SESSION}`,
		`H segment ${segment}`,
		`H mission ${JSON.stringify(mission)}`,
		'H author "[ABC]Author"',
		'H world "{853E92315D1D9EFE}worlds/Eden/Eden.ent"',
		'H bounds 0 0 12800 12800',
		'H started 1793563200',
		'H end',
		'SNAP',
		...Array.from({ length: 200 }, (_, i) => `P ${i} ${4500 + i} ${6100 + segment} 41 87`),
		'SNAP-END',
		'',
	].join('\n');
}

export function commitBody(
	file: TestFile,
	kind: 'segment' | 'identity' | 'stats',
	name: string,
	overrides: Record<string, unknown> = {}
): Buffer {
	return Buffer.from(
		JSON.stringify({
			kind,
			session: SESSION,
			name,
			size: file.size,
			encoding: 'gzip',
			encodedSize: file.encoded.length,
			encodedSha256: file.encodedSha256,
			pieces: file.pieces.length,
			...overrides,
		})
	);
}

export function gameBody(post: Record<string, unknown>): Buffer {
	return Buffer.from(JSON.stringify({ session: SESSION, over: 'stopped', identity: null, stats: null, ...post }));
}

export type FakeStorage = {
	url: string;
	stored: Map<string, { body: Buffer; headers: http.IncomingHttpHeaders }>;
	failPuts: (count: number) => void;
	close: () => Promise<void>;
};

/** Keeps PUT bodies by path and serves them back on GET, as a private bucket would. */
export async function startFakeStorage(): Promise<FakeStorage> {
	const stored = new Map<string, { body: Buffer; headers: http.IncomingHttpHeaders }>();
	let failing = 0;
	const server = http.createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on('data', (chunk: Buffer) => chunks.push(chunk));
		req.on('end', () => {
			const key = req.url ?? '';
			if (req.method === 'PUT') {
				if (failing > 0) {
					failing--;
					res.statusCode = 500;
					res.end();
					return;
				}
				stored.set(key, { body: Buffer.concat(chunks), headers: req.headers });
				res.statusCode = 200;
				res.end();
				return;
			}
			if (req.method === 'GET') {
				const object = stored.get(key);
				if (!object) {
					res.statusCode = 404;
					res.end();
					return;
				}
				res.setHeader('content-length', String(object.body.length));
				res.statusCode = 200;
				res.end(object.body);
				return;
			}
			res.statusCode = 405;
			res.end();
		});
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as AddressInfo;
	return {
		url: `http://127.0.0.1:${port}`,
		stored,
		failPuts: (count) => {
			failing = count;
		},
		close: () => new Promise<void>((resolve) => server.close(() => resolve())),
	};
}
