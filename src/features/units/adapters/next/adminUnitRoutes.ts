import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/features/admin/adapters/next/adminAuth';
import { unitDeps } from '@/features/units/deps';
import { listUnits } from '@/features/units/useCases/listUnits';
import { getUnit } from '@/features/units/useCases/getUnit';
import { adminUpdateUnit, adminSetSlots } from '@/features/units/useCases/adminUpdateUnit';
import { adminVerifyUnit } from '@/features/units/useCases/adminVerifyUnit';
import { adminSetLeader } from '@/features/units/useCases/adminSetLeader';
import { manageMember } from '@/features/units/useCases/manageMember';
import { uploadAvatar, deleteAvatar } from '@/features/units/useCases/unitAvatar';
import { readUnitId, type UnitRouteContext } from './unitRouteHelpers';
import { errorToLogObject, logger } from '@/platform/logger';
import type { UnitStatus } from '@/features/units/domain/types';

export async function getAdminListUnitsRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const url = request.nextUrl;
		const page = parseInt(url.searchParams.get('page') ?? '1', 10) || 1;
		const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') ?? '50', 10) || 50, 100);
		const query = url.searchParams.get('q') ?? undefined;
		const status = (url.searchParams.get('status') as UnitStatus | null) ?? undefined;
		const slotsParam = url.searchParams.get('hasSlots');
		const hasSlots = slotsParam === 'true' ? true : slotsParam === 'false' ? false : undefined;

		const result = listUnits(unitDeps, { status, query, hasSlots, page, pageSize });
		return NextResponse.json(result.json);
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_list_units_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function getAdminUnitDetailRoute(request: NextRequest, context: UnitRouteContext): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const unitId = await readUnitId(context);
		if (!unitId) return NextResponse.json({ error: 'invalid_unit_id' }, { status: 400 });

		const result = getUnit(unitDeps, { unitId, viewerSteamId64: admin.identity.steamid64, isAdmin: true });
		return NextResponse.json(result.json, { status: result.status });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_get_unit_detail_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function putAdminUpdateUnitRoute(request: NextRequest, context: UnitRouteContext): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const unitId = await readUnitId(context);
		if (!unitId) return NextResponse.json({ error: 'invalid_unit_id' }, { status: 400 });

		const body: unknown = await request.json();
		const result = adminUpdateUnit(unitDeps, { unitId, body });
		return NextResponse.json(result.json, { status: result.status });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_update_unit_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminVerifyUnitRoute(request: NextRequest, context: UnitRouteContext): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const unitId = await readUnitId(context);
		if (!unitId) return NextResponse.json({ error: 'invalid_unit_id' }, { status: 400 });

		const body: unknown = await request.json();
		const result = adminVerifyUnit(unitDeps, { unitId, body, steamid64: admin.identity.steamid64 });
		return NextResponse.json(result.json, { status: result.status });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_verify_unit_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminSetSlotsRoute(request: NextRequest, context: UnitRouteContext): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const unitId = await readUnitId(context);
		if (!unitId) return NextResponse.json({ error: 'invalid_unit_id' }, { status: 400 });

		const body: unknown = await request.json();
		const result = adminSetSlots(unitDeps, { unitId, body });
		return NextResponse.json(result.json, { status: result.status });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_set_slots_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminSetLeaderRoute(request: NextRequest, context: UnitRouteContext): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const unitId = await readUnitId(context);
		if (!unitId) return NextResponse.json({ error: 'invalid_unit_id' }, { status: 400 });

		const body: unknown = await request.json();
		const result = adminSetLeader(unitDeps, { unitId, body });
		return NextResponse.json(result.json, { status: result.status });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_set_leader_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminManageMembersRoute(request: NextRequest, context: UnitRouteContext): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const unitId = await readUnitId(context);
		if (!unitId) return NextResponse.json({ error: 'invalid_unit_id' }, { status: 400 });

		const body: unknown = await request.json();
		const result = manageMember(unitDeps, {
			unitId,
			body,
			steamid64: admin.identity.steamid64,
			isAdmin: true
		});
		return NextResponse.json(result.json, { status: result.status });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_manage_members_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminUploadAvatarRoute(request: NextRequest, context: UnitRouteContext): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const unitId = await readUnitId(context);
		if (!unitId) return NextResponse.json({ error: 'invalid_unit_id' }, { status: 400 });

		const body: unknown = await request.json();
		const result = uploadAvatar(unitDeps, {
			unitId,
			body,
			steamid64: admin.identity.steamid64,
			isAdmin: true
		});
		return NextResponse.json(result.json, { status: result.status });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_upload_avatar_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function deleteAdminAvatarRoute(request: NextRequest, context: UnitRouteContext): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const unitId = await readUnitId(context);
		if (!unitId) return NextResponse.json({ error: 'invalid_unit_id' }, { status: 400 });

		const result = deleteAvatar(unitDeps, {
			unitId,
			steamid64: admin.identity.steamid64,
			isAdmin: true
		});
		return NextResponse.json(result.json, { status: result.status });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_delete_avatar_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
