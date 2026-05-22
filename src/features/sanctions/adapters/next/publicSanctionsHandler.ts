import { NextRequest, NextResponse } from 'next/server';
import { errorToLogObject, logger } from '@/platform/logger';
import { listPublicSanctions } from '../../useCases/listPublicSanctions';
import { listPublicSanctionsDeps } from '../../deps';

const DEFAULT_PAGE_SIZE = 50;

function normalizePage(value: string | null): number {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1) return 1;
	return parsed;
}

export async function getPublicSanctionsRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const page = normalizePage(request.nextUrl.searchParams.get('page'));
		const query = request.nextUrl.searchParams.get('q')?.trim() || undefined;
		const typeFilter = request.nextUrl.searchParams.get('type') || undefined;
		const status = request.nextUrl.searchParams.get('status') || undefined;

		const result = listPublicSanctions(listPublicSanctionsDeps, {
			page,
			pageSize: DEFAULT_PAGE_SIZE,
			query,
			typeFilter,
			status
		});

		return NextResponse.json({
			success: true,
			sanctions: result.sanctions,
			total: result.total,
			page: result.page,
			pageSize: result.pageSize,
			totalPages: result.totalPages
		});
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'public_list_sanctions_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
