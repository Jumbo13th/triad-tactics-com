import { NextRequest } from 'next/server';
import { runEmailOutboxOnce } from '@/platform/outbox/emailOutboxWorker';

export const runtime = 'nodejs';

function isAuthorized(request: NextRequest): boolean {
	const secret = process.env.OUTBOX_CRON_SECRET?.trim();
	if (!secret) return false;

	const header = request.headers.get('authorization') || request.headers.get('x-cron-secret');
	const bearer = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : header;
	const querySecret = request.nextUrl.searchParams.get('secret');
	const token = (bearer || querySecret || '').trim();
	return token.length > 0 && token === secret;
}

export async function GET(request: NextRequest) {
	if (!isAuthorized(request)) {
		return new Response('Unauthorized', { status: 401 });
	}

	await runEmailOutboxOnce();
	return new Response('OK', { status: 200 });
}
