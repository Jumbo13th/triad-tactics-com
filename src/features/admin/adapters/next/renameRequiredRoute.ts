import { NextRequest, NextResponse } from 'next/server';
import { confirmApplicationAndNotifyDeps, renameRequiredDeps } from '@/features/admin/deps';
import { confirmApplicationAndNotify } from '@/features/admin/useCases/confirmApplicationAndNotify';
import { clearRenameRequired, setRenameRequired } from '@/features/admin/useCases/renameRequired';
import { renameRequiredRequestSchema } from '@/features/admin/domain/requests';
import { requireAdmin } from './adminAuth';

export async function postRenameRequiredRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;
		const { identity } = admin;

		const body: unknown = await request.json();
		const parsed = renameRequiredRequestSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const { action, steamid64, reason, applicationId } = parsed.data;

		if (action === 'clear') {
			const result = clearRenameRequired(renameRequiredDeps, { steamid64 });
			if (!result.ok) return NextResponse.json({ error: 'server_error' }, { status: 500 });
			return NextResponse.json({ success: true });
		}

		// Optional: confirm the application before requiring rename.
		// This models the admin flow: user is approved but must rename callsign.
		if (applicationId != null) {
			const confirmed = await confirmApplicationAndNotify(confirmApplicationAndNotifyDeps, {
				applicationId,
				confirmedBySteamId64: identity.steamid64,
				renameRequired: true
			});

			if (!confirmed.ok) {
				if (confirmed.error === 'not_found') {
					return NextResponse.json({ error: 'not_found' }, { status: 404 });
				}
				return NextResponse.json({ error: 'server_error' }, { status: 500 });
			}
		}

		const result = setRenameRequired(renameRequiredDeps, {
			steamid64,
			requestedBySteamId64: identity.steamid64,
			reason
		});
		if (!result.ok) {
			if (result.error === 'not_found') {
				return NextResponse.json({ error: 'not_found' }, { status: 404 });
			}
			if (
				result.error === 'not_confirmed' ||
				result.error === 'rename_already_required' ||
				result.error === 'rename_request_pending'
			) {
				return NextResponse.json({ error: result.error }, { status: 409 });
			}
			return NextResponse.json({ error: 'server_error' }, { status: 500 });
		}
		return NextResponse.json({ success: true });
	} catch {
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
