import { NextRequest } from 'next/server';
import { getAdminApplicationsRoute } from '@/features/admin/adapters/next/listApplicationsRoute';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
	return getAdminApplicationsRoute(request);
}
