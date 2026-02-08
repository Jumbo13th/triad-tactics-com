import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/features/admin/adapters/next/adminAuth';
import { contentSettingsRequestSchema } from '@/features/content/domain/requests';
import { getContentSettings } from '@/features/content/useCases/getContentSettings';
import { updateContentSettings } from '@/features/content/useCases/updateContentSettings';
import { getContentSettingsDeps, updateContentSettingsDeps } from '@/features/content/deps';
import { errorToLogObject, logger } from '@/platform/logger';

export async function getAdminContentRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const settings = getContentSettings(getContentSettingsDeps);
		return NextResponse.json({ success: true, ...settings });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_content_load_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function putAdminContentRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const body: unknown = await request.json();
		const parsed = contentSettingsRequestSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const updated = updateContentSettings(updateContentSettingsDeps, parsed.data, admin.identity.steamid64);
		if (!updated.ok) {
			return NextResponse.json({ error: 'server_error' }, { status: 500 });
		}

		return NextResponse.json({ success: true, ...parsed.data });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_content_save_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
