import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { secretEquals } from '@/platform/crypto/secretCompare';
import {
	CLOCK_SKEW_SECONDS,
	MIN_SECRET_LENGTH,
	UPLOAD_BASE_PATH,
	isServerId,
	signUploadRequest,
} from '../../domain/protocol';

export type UploadAuthResult = { ok: true; serverId: string; body: Buffer } | { ok: false; status: 400 | 401 | 413 };

const TIMESTAMP_PATTERN = /^\d{1,12}$/;
const LENGTH_PATTERN = /^\d{1,10}$/;

// Every check but the body hash runs on the headers, so a refused request is never read.
export async function authenticateUpload(request: NextRequest, maxBodyBytes: number): Promise<UploadAuthResult> {
	// One secret for every game server. The game-server API secret is never reused here:
	// the game's own REST client sends that one in a query string.
	const secret = process.env.REPLAY_UPLOAD_SECRET?.trim() ?? '';
	if (secret.length < MIN_SECRET_LENGTH) return { ok: false, status: 401 };

	const serverId = request.headers.get('x-ll-server') ?? '';
	if (!isServerId(serverId)) return { ok: false, status: 401 };

	const timestamp = request.headers.get('x-ll-timestamp') ?? '';
	const nowSeconds = Math.floor(Date.now() / 1000);
	if (!TIMESTAMP_PATTERN.test(timestamp) || Math.abs(nowSeconds - Number(timestamp)) > CLOCK_SKEW_SECONDS) {
		return { ok: false, status: 401 };
	}

	if (request.method === 'PUT' || request.method === 'POST') {
		const length = request.headers.get('content-length') ?? '';
		if (!LENGTH_PATTERN.test(length) || Number(length) > maxBodyBytes) return { ok: false, status: 413 };
	}

	// The host signs the path relative to its configured base address.
	const url = new URL(request.url);
	if (!url.pathname.startsWith(`${UPLOAD_BASE_PATH}/`)) return { ok: false, status: 401 };
	const path = url.pathname.slice(UPLOAD_BASE_PATH.length) + url.search;
	const contentSha256 = request.headers.get('x-ll-content-sha256') ?? '';
	const expected = signUploadRequest(secret, request.method, path, timestamp, contentSha256);
	if (!secretEquals(request.headers.get('x-ll-signature'), expected)) return { ok: false, status: 401 };

	const body = Buffer.from(await request.arrayBuffer());
	if (body.length > maxBodyBytes) return { ok: false, status: 413 };
	if (createHash('sha256').update(body).digest('hex') !== contentSha256) return { ok: false, status: 400 };
	return { ok: true, serverId, body };
}
