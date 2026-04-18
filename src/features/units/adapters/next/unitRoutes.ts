import { NextRequest, NextResponse } from 'next/server';
import { unitDeps } from '@/features/units/deps';
import { createUnit } from '@/features/units/useCases/createUnit';
import { listUnits } from '@/features/units/useCases/listUnits';
import { getUnit } from '@/features/units/useCases/getUnit';
import { updateUnit } from '@/features/units/useCases/updateUnit';
import { applyToUnit } from '@/features/units/useCases/applyToUnit';
import { leaveUnit } from '@/features/units/useCases/leaveUnit';
import { transferLeadership } from '@/features/units/useCases/transferLeadership';
import { deleteUnitAsLeader } from '@/features/units/useCases/deleteUnit';
import { requireConnectedUser, getOptionalSteamId64, readUnitId, type UnitRouteContext } from './unitRouteHelpers';
import { errorToLogObject, logger } from '@/platform/logger';

export async function getListUnitsRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const url = request.nextUrl;
		const page = parseInt(url.searchParams.get('page') ?? '1', 10) || 1;
		const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') ?? '50', 10) || 50, 100);
		const query = url.searchParams.get('q') ?? undefined;
		const slotsParam = url.searchParams.get('hasSlots');
		const hasSlots = slotsParam === 'true' ? true : slotsParam === 'false' ? false : undefined;

		const viewerSteamId64 = getOptionalSteamId64(request);
		let hasUnit = false;
		if (viewerSteamId64) {
			const user = unitDeps.users.getUserBySteamId64(viewerSteamId64);
			if (user) hasUnit = !!unitDeps.memberships.getActiveMemberUnit(user.id);
		}

		const result = listUnits(unitDeps, { status: 'verified', query, hasSlots, page, pageSize });
		return NextResponse.json({ ...result.json, viewer: { hasUnit } });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'list_units_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postCreateUnitRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const auth = requireConnectedUser(request);
		if (!auth.ok) return auth.response;

		const body: unknown = await request.json();
		const result = createUnit(unitDeps, { body, steamid64: auth.identity.steamid64 });
		return NextResponse.json(result.json, { status: result.status });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'create_unit_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function getUnitDetailRoute(request: NextRequest, context: UnitRouteContext): Promise<NextResponse> {
	try {
		const unitId = await readUnitId(context);
		if (!unitId) return NextResponse.json({ error: 'invalid_unit_id' }, { status: 400 });

		const viewerSteamId64 = getOptionalSteamId64(request);
		const isAdmin = viewerSteamId64 ? (await import('@/platform/admin')).isAdminSteamId(viewerSteamId64) : false;
		const result = getUnit(unitDeps, { unitId, viewerSteamId64, isAdmin });
		return NextResponse.json(result.json, { status: result.status });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'get_unit_detail_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function putUpdateUnitRoute(request: NextRequest, context: UnitRouteContext): Promise<NextResponse> {
	try {
		const auth = requireConnectedUser(request);
		if (!auth.ok) return auth.response;

		const unitId = await readUnitId(context);
		if (!unitId) return NextResponse.json({ error: 'invalid_unit_id' }, { status: 400 });

		const body: unknown = await request.json();
		const result = updateUnit(unitDeps, {
			unitId,
			body,
			steamid64: auth.identity.steamid64,
			isAdmin: auth.isAdmin
		});
		return NextResponse.json(result.json, { status: result.status });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'update_unit_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postApplyToUnitRoute(request: NextRequest, context: UnitRouteContext): Promise<NextResponse> {
	try {
		const auth = requireConnectedUser(request);
		if (!auth.ok) return auth.response;

		const unitId = await readUnitId(context);
		if (!unitId) return NextResponse.json({ error: 'invalid_unit_id' }, { status: 400 });

		let message: string | undefined;
		try {
			const body = await request.json() as { message?: string };
			message = typeof body.message === 'string' ? body.message : undefined;
		} catch {}

		const result = applyToUnit(unitDeps, { unitId, steamid64: auth.identity.steamid64, message });
		return NextResponse.json(result.json, { status: result.status });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'apply_to_unit_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postLeaveUnitRoute(request: NextRequest, context: UnitRouteContext): Promise<NextResponse> {
	try {
		const auth = requireConnectedUser(request);
		if (!auth.ok) return auth.response;

		const unitId = await readUnitId(context);
		if (!unitId) return NextResponse.json({ error: 'invalid_unit_id' }, { status: 400 });

		const result = leaveUnit(unitDeps, { unitId, steamid64: auth.identity.steamid64 });
		return NextResponse.json(result.json, { status: result.status });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'leave_unit_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postManageMembersRoute(request: NextRequest, context: UnitRouteContext): Promise<NextResponse> {
	try {
		const auth = requireConnectedUser(request);
		if (!auth.ok) return auth.response;

		const unitId = await readUnitId(context);
		if (!unitId) return NextResponse.json({ error: 'invalid_unit_id' }, { status: 400 });

		const { manageMember } = await import('@/features/units/useCases/manageMember');
		const body: unknown = await request.json();
		const result = manageMember(unitDeps, {
			unitId,
			body,
			steamid64: auth.identity.steamid64,
			isAdmin: auth.isAdmin
		});
		return NextResponse.json(result.json, { status: result.status });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'manage_members_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postTransferLeadershipRoute(request: NextRequest, context: UnitRouteContext): Promise<NextResponse> {
	try {
		const auth = requireConnectedUser(request);
		if (!auth.ok) return auth.response;

		const unitId = await readUnitId(context);
		if (!unitId) return NextResponse.json({ error: 'invalid_unit_id' }, { status: 400 });

		const body: unknown = await request.json();
		const result = transferLeadership(unitDeps, {
			unitId,
			body,
			steamid64: auth.identity.steamid64,
			isAdmin: auth.isAdmin
		});
		return NextResponse.json(result.json, { status: result.status });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'transfer_leadership_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function deleteUnitRoute(request: NextRequest, context: UnitRouteContext): Promise<NextResponse> {
	try {
		const auth = requireConnectedUser(request);
		if (!auth.ok) return auth.response;

		const unitId = await readUnitId(context);
		if (!unitId) return NextResponse.json({ error: 'invalid_unit_id' }, { status: 400 });

		const result = deleteUnitAsLeader(unitDeps, { unitId, steamid64: auth.identity.steamid64 });
		return NextResponse.json(result.json, { status: result.status });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'delete_unit_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
