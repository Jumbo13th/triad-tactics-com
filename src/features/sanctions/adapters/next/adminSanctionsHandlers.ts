import { NextRequest, NextResponse } from 'next/server';
import { errorToLogObject, logger } from '@/platform/logger';
import { requireAdmin } from '@/features/admin/adapters/next/adminAuth';
import { listSanctions } from '../../useCases/listSanctions';
import { createSanction } from '../../useCases/createSanction';
import { cancelSanction } from '../../useCases/cancelSanction';
import { updateSanctionExpiry } from '../../useCases/updateSanctionExpiry';
import { listSanctionsDeps, createSanctionDeps, cancelSanctionDeps, updateSanctionExpiryDeps } from '../../deps';
import type { SanctionType } from '../../domain/types';

const DEFAULT_PAGE_SIZE = 50;

function normalizeTypeFilter(value: string | null): SanctionType | null {
	if (!value) return null;
	const v = value.trim().toLowerCase();
	if (v === 'site_ban' || v === 'server_ban' || v === 'strike') return v;
	return null;
}

function normalizePage(value: string | null): number {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1) return 1;
	return parsed;
}

export async function getAdminSanctionsRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const typeFilter = normalizeTypeFilter(request.nextUrl.searchParams.get('type'));
		const q = request.nextUrl.searchParams.get('q') ?? '';
		const page = normalizePage(request.nextUrl.searchParams.get('page'));

		const result = listSanctions(listSanctionsDeps, {
			typeFilter,
			query: q,
			page,
			pageSize: DEFAULT_PAGE_SIZE
		});

		return NextResponse.json({
			success: true,
			sanctions: result.sanctions,
			total: result.total,
			page: result.page,
			pageSize: result.pageSize,
			totalPages: result.totalPages,
			counts: result.counts
		});
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_list_sanctions_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminCreateSanctionRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const body = await request.json();
		const { userId, type, reason, durationMinutes } = body as {
			userId: number;
			type: SanctionType;
			reason: string;
			durationMinutes: number | null;
		};

		if (!userId || !type || typeof reason !== 'string') {
			return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
		}

		if (!['site_ban', 'server_ban', 'strike'].includes(type)) {
			return NextResponse.json({ error: 'invalid_type' }, { status: 400 });
		}

		const result = createSanction(createSanctionDeps, {
			userId,
			type,
			reason,
			durationMinutes: type === 'strike' ? null : (durationMinutes ?? null),
			createdBySteamId64: admin.identity.steamid64
		});

		if (!result.success) {
			return NextResponse.json({ success: false, error: result.error }, { status: 400 });
		}

		return NextResponse.json({ success: true, autoEscalation: result.autoEscalation ?? false });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_create_sanction_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminCancelSanctionRoute(
	request: NextRequest,
	{ params }: { params: Promise<{ sanctionId: string }> }
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const { sanctionId: sanctionIdStr } = await params;
		const sanctionId = Number(sanctionIdStr);
		if (!Number.isInteger(sanctionId) || sanctionId < 1) {
			return NextResponse.json({ error: 'invalid_sanction_id' }, { status: 400 });
		}

		const body = await request.json();
		const { reason } = body as { reason: string };
		if (typeof reason !== 'string' || !reason.trim()) {
			return NextResponse.json({ error: 'reason_required' }, { status: 400 });
		}

		const result = cancelSanction(cancelSanctionDeps, {
			sanctionId,
			cancelledBySteamId64: admin.identity.steamid64,
			cancelledReason: reason.trim()
		});

		if (!result.success) {
			return NextResponse.json({ success: false, error: result.error }, { status: 400 });
		}

		return NextResponse.json({ success: true });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_cancel_sanction_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminUpdateSanctionExpiryRoute(
	request: NextRequest,
	{ params }: { params: Promise<{ sanctionId: string }> }
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const { sanctionId: sanctionIdStr } = await params;
		const sanctionId = Number(sanctionIdStr);
		if (!Number.isInteger(sanctionId) || sanctionId < 1) {
			return NextResponse.json({ error: 'invalid_sanction_id' }, { status: 400 });
		}

		const body = await request.json();
		const { expiresAt } = body as { expiresAt: string | null };
		if (expiresAt !== null && typeof expiresAt !== 'string') {
			return NextResponse.json({ error: 'invalid_expires_at' }, { status: 400 });
		}
		if (expiresAt !== null && new Date(expiresAt.replace(' ', 'T') + 'Z') <= new Date()) {
			return NextResponse.json({ error: 'expires_in_past' }, { status: 400 });
		}

		const result = updateSanctionExpiry(updateSanctionExpiryDeps, {
			sanctionId,
			newExpiresAt: expiresAt,
			updatedBySteamId64: admin.identity.steamid64
		});

		if (!result.success) {
			return NextResponse.json({ success: false, error: result.error }, { status: 400 });
		}

		return NextResponse.json({ success: true });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_update_sanction_expiry_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
