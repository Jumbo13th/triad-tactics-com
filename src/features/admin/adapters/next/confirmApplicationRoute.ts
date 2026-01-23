import { NextRequest, NextResponse } from 'next/server';
import { confirmApplicationAndNotify } from '@/features/admin/useCases/confirmApplicationAndNotify';
import { confirmApplicationAndNotifyDeps } from '@/features/admin/deps';
import { confirmApplicationRequestSchema } from '@/features/admin/domain/requests';
import { requireAdmin } from './adminAuth';

export async function postConfirmApplicationRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;
		const { identity } = admin;

		const body: unknown = await request.json();
		const parsed = confirmApplicationRequestSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const result = await confirmApplicationAndNotify(confirmApplicationAndNotifyDeps, {
			applicationId: parsed.data.applicationId,
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
