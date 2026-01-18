import { NextRequest, NextResponse } from 'next/server';
import { confirmApplication } from '@/features/admin/useCases/confirmApplication';
import { confirmApplicationDeps } from '@/features/admin/deps';
import { requireAdmin } from './adminAuth';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export async function postConfirmApplicationRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;
		const { identity } = admin;

		const body: unknown = await request.json();
		const applicationIdRaw = isRecord(body) ? body.applicationId : undefined;
		const applicationId = typeof applicationIdRaw === 'number' ? applicationIdRaw : Number(applicationIdRaw);
		if (!Number.isFinite(applicationId) || applicationId <= 0) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const result = confirmApplication(confirmApplicationDeps, {
			applicationId,
			confirmedBySteamId64: identity.steamid64
		});

		if (!result.ok) {
			if (result.error === 'not_found') {
				return NextResponse.json({ error: 'not_found' }, { status: 404 });
			}
			return NextResponse.json({ error: 'server_error' }, { status: 500 });
		}

		return NextResponse.json({ success: true });
	} catch {
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
