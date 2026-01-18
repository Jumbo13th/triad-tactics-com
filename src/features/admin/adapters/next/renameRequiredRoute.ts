import { NextRequest, NextResponse } from 'next/server';
import { renameRequiredDeps } from '@/features/admin/deps';
import { clearRenameRequired, setRenameRequired } from '@/features/admin/useCases/renameRequired';
import { requireAdmin } from './adminAuth';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export async function postRenameRequiredRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;
		const { identity } = admin;

		const body: unknown = await request.json();
		const steamid64Raw = isRecord(body) ? body.steamid64 : undefined;
		const steamid64 = typeof steamid64Raw === 'string' ? steamid64Raw.trim() : '';
		if (!steamid64) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const actionRaw = isRecord(body) ? body.action : undefined;
		const action = typeof actionRaw === 'string' ? actionRaw.trim().toLowerCase() : 'require';
		const reasonRaw = isRecord(body) ? body.reason : undefined;
		const reason = typeof reasonRaw === 'string' ? reasonRaw.trim() : null;

		if (action === 'clear') {
			const result = clearRenameRequired(renameRequiredDeps, { steamid64 });
			if (!result.ok) return NextResponse.json({ error: 'server_error' }, { status: 500 });
			return NextResponse.json({ success: true });
		}

		const result = setRenameRequired(renameRequiredDeps, {
			steamid64,
			requestedBySteamId64: identity.steamid64,
			reason
		});

		if (!result.ok) return NextResponse.json({ error: 'server_error' }, { status: 500 });
		return NextResponse.json({ success: true });
	} catch {
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
