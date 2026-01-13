import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_PASSWORD } from '@/platform/env';
import { listApplications } from '@/features/admin/useCases/listApplications';
import { listApplicationsDeps } from '@/features/admin/deps';
import { errorToLogObject, logger } from '@/platform/logger';

export async function getAdminApplicationsRoute(request: NextRequest): Promise<NextResponse> {
	try {
		if (!ADMIN_PASSWORD) {
			return NextResponse.json({ error: 'admin_not_configured' }, { status: 500 });
		}

		const password = request.headers.get('x-admin-password');
		if (password !== ADMIN_PASSWORD) {
			return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
		}

		const { applications } = listApplications(listApplicationsDeps);
		return NextResponse.json({
			success: true,
			count: applications.length,
			applications
		});
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_list_applications_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
