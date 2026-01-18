import { NextRequest, NextResponse } from 'next/server';
import { listApplications } from '@/features/admin/useCases/listApplications';
import { listApplicationsDeps } from '@/features/admin/deps';
import { errorToLogObject, logger } from '@/platform/logger';
import { requireAdmin } from './adminAuth';
import type { Application } from '@/platform/db';

function normalizeStatus(value: string | null): 'active' | 'archived' | 'all' {
	if (!value) return 'active';
	const v = value.trim().toLowerCase();
	if (v === 'archived') return 'archived';
	if (v === 'all') return 'all';
	return 'active';
}

function matchesQuery(app: Application, q: string) {
	const needle = q.trim().toLowerCase();
	if (!needle) return true;
	const callsign = app.answers?.callsign ?? '';
	const name = app.answers?.name ?? '';
	const haystacks = [
		app.email ?? '',
		app.steamid64 ?? '',
		app.persona_name ?? '',
		callsign,
		name
	];
	return haystacks.some((h) => h.toLowerCase().includes(needle));
}

export async function getAdminApplicationsRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const status = normalizeStatus(request.nextUrl.searchParams.get('status'));
		const q = request.nextUrl.searchParams.get('q') ?? '';

		const { applications: raw, counts } = listApplications(listApplicationsDeps, { status });
		const applications = q.trim() ? raw.filter((a) => matchesQuery(a, q)) : raw;
		return NextResponse.json({
			success: true,
			count: applications.length,
			counts,
			applications
		});
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_list_applications_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
