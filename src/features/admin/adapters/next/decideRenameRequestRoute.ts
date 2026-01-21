import { NextRequest, NextResponse } from 'next/server';
import { decideRenameRequest } from '@/features/admin/useCases/decideRenameRequest';
import { renameRequestsDeps } from '@/features/admin/deps';
import { decideRenameRequestSchema } from '@/features/admin/domain/requests';
import { requireAdmin } from './adminAuth';

export async function postDecideRenameRequestRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;
		const { identity } = admin;

		const body: unknown = await request.json();
		const parsed = decideRenameRequestSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const result = decideRenameRequest(renameRequestsDeps, {
			requestId: parsed.data.requestId,
			decision: parsed.data.decision,
			decidedBySteamId64: identity.steamid64,
			declineReason: parsed.data.declineReason ?? null
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
