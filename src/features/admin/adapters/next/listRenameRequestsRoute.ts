import { NextRequest, NextResponse } from 'next/server';
import { errorToLogObject, logger } from '@/platform/logger';
import { listRenameRequests } from '@/features/admin/useCases/listRenameRequests';
import { renameRequestsDeps } from '@/features/admin/deps';
import { requireAdmin } from './adminAuth';

function normalizeStatus(value: string | null): 'pending' | 'approved' | 'declined' | 'all' {
	if (!value) return 'pending';
	const v = value.trim().toLowerCase();
	if (v === 'approved') return 'approved';
	if (v === 'declined') return 'declined';
	if (v === 'all') return 'all';
	return 'pending';
}

export async function getAdminRenameRequestsRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const status = normalizeStatus(request.nextUrl.searchParams.get('status'));
		const q = request.nextUrl.searchParams.get('q') ?? '';

		const { renameRequests } = listRenameRequests(renameRequestsDeps, { status, query: q });

		return NextResponse.json({
			success: true,
			count: renameRequests.length,
			renameRequests
		});
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_list_rename_requests_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
