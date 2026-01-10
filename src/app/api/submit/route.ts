import { NextRequest } from 'next/server';
import { postSubmitApplicationRoute } from '@/features/apply/adapters/next/submitRoute';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
	return postSubmitApplicationRoute(request);
}
