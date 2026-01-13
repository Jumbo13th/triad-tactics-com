import { NextRequest } from 'next/server';
import { postConfirmApplicationRoute } from '@/features/admin/adapters/next/confirmApplicationRoute';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
	return postConfirmApplicationRoute(request);
}
