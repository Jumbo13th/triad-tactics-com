import { NextRequest } from 'next/server';
import { getAdminStatusRoute } from '@/features/admin/adapters/next/statusRoute';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
	return getAdminStatusRoute(request);
}
