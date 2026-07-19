import { NextRequest } from 'next/server';
import { secretEquals } from '@/platform/crypto/secretCompare';

// Shared secret gate for every game-server endpoint (player / units / season).
// Prefer the Authorization header (kept out of access logs); fall back to the
// query-string secret for the game-runtime REST client, which cannot set
// custom headers.
export function isGameserverAuthorized(request: NextRequest): boolean {
	const secret = process.env.GAMESERVER_API_SECRET?.trim();
	if (!secret) return false;

	const header = request.headers.get('authorization') || request.headers.get('x-gameserver-secret');
	const bearer = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : header;
	const token = (bearer || request.nextUrl.searchParams.get('secret') || '').trim();
	return secretEquals(token, secret);
}
