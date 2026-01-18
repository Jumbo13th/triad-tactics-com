import { NextRequest, NextResponse } from 'next/server';
import { decideRenameRequest } from '@/features/admin/useCases/decideRenameRequest';
import { renameRequestsDeps } from '@/features/admin/deps';
import { requireAdmin } from './adminAuth';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export async function postDecideRenameRequestRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;
		const { identity } = admin;

		const body: unknown = await request.json();
		const requestIdRaw = isRecord(body) ? body.requestId : undefined;
		const requestId = typeof requestIdRaw === 'number' ? requestIdRaw : Number(requestIdRaw);
		if (!Number.isFinite(requestId) || requestId <= 0) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const decisionRaw = isRecord(body) ? body.decision : undefined;
		const decision = typeof decisionRaw === 'string' ? decisionRaw.trim().toLowerCase() : '';
		if (decision !== 'approve' && decision !== 'decline') {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const declineReasonRaw = isRecord(body) ? body.declineReason : undefined;
		const declineReason = typeof declineReasonRaw === 'string' ? declineReasonRaw.trim() : null;

		const result = decideRenameRequest(renameRequestsDeps, {
			requestId,
			decision: decision as 'approve' | 'decline',
			decidedBySteamId64: identity.steamid64,
			declineReason
		});

		if (!result.ok) {
			if (result.error === 'not_found') {
				return NextResponse.json({ error: 'not_found' }, { status: 404 });
			}
			if (result.error === 'not_pending') {
				return NextResponse.json({ error: 'not_pending' }, { status: 409 });
			}
			return NextResponse.json({ error: 'server_error' }, { status: 500 });
		}

		return NextResponse.json({ success: true });
	} catch {
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
