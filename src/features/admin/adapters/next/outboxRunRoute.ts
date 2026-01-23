import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from './adminAuth';
import { runEmailOutboxOnce } from '@/platform/outbox/emailOutboxWorker';

export async function postRunOutboxRoute(request: NextRequest): Promise<NextResponse> {
	const admin = requireAdmin(request);
	if (!admin.ok) return admin.response;

	try {
		await runEmailOutboxOnce();
		return NextResponse.json({ success: true });
	} catch {
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}