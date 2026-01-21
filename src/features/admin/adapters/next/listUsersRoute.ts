import { NextRequest, NextResponse } from 'next/server';
import { errorToLogObject, logger } from '@/platform/logger';
import { listUsers } from '@/features/admin/useCases/listUsers';
import { listUsersDeps } from '@/features/admin/deps';
import { requireAdmin } from './adminAuth';

function normalizeStatus(value: string | null): 'all' | 'rename_required' | 'confirmed' {
	if (!value) return 'all';
	const v = value.trim().toLowerCase();
	if (v === 'rename_required' || v === 'rename-required') return 'rename_required';
	if (v === 'confirmed') return 'confirmed';
	return 'all';
}

export async function getAdminUsersRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const status = normalizeStatus(request.nextUrl.searchParams.get('status'));
		const q = request.nextUrl.searchParams.get('q') ?? '';

		const { users, counts } = listUsers(listUsersDeps, { status, query: q });

		return NextResponse.json({
			success: true,
			count: users.length,
			counts,
			users
		});
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_list_users_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
