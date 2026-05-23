import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from './adminAuth';
import {
	createBadgeTypeRequestSchema,
	mutateUserBadgeRequestSchema,
	updateBadgeTypeDiscordRoleRequestSchema,
	updateBadgeTypeStatusRequestSchema
} from '@/features/admin/domain/requests';
import {
	assignUserBadgeDeps,
	createBadgeTypeDeps,
	listBadgeTypesDeps,
	removeUserBadgeDeps,
	updateBadgeTypeDiscordRoleDeps,
	updateBadgeTypeStatusDeps
} from '@/features/admin/deps';
import { assignUserBadge } from '@/features/admin/useCases/assignUserBadge';
import { createBadgeType } from '@/features/admin/useCases/createBadgeType';
import { listBadgeTypes } from '@/features/admin/useCases/listBadgeTypes';
import { removeUserBadge } from '@/features/admin/useCases/removeUserBadge';
import { updateBadgeTypeDiscordRole } from '@/features/admin/useCases/updateBadgeTypeDiscordRole';
import { updateBadgeTypeStatus } from '@/features/admin/useCases/updateBadgeTypeStatus';
import { errorToLogObject, logger } from '@/platform/logger';

type BadgeStatusRouteContext = {
	params: Promise<{ badgeTypeId: string }>;
};

type UserBadgeRouteContext = {
	params: Promise<{ userId: string }>;
};

async function readRequestBody(request: NextRequest): Promise<unknown> {
	const raw = await request.text();
	if (!raw.trim()) return {};
	return JSON.parse(raw) as unknown;
}

async function readPositiveParam<T extends { [key: string]: string }>(
	paramsPromise: Promise<T>,
	key: keyof T
): Promise<number | null> {
	const params = await paramsPromise;
	const value = Number(params[key]);
	if (!Number.isSafeInteger(value) || value < 1) return null;
	return value;
}

function mapBadgeError(error: string): NextResponse {
	if (error === 'not_found') {
		return NextResponse.json({ error }, { status: 404 });
	}

	if (error === 'badge_retired') {
		return NextResponse.json({ error }, { status: 409 });
	}

	const status = error === 'database_error' ? 500 : 400;
	return NextResponse.json({ error }, { status });
}

export async function getAdminBadgesRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const { badges } = listBadgeTypes(listBadgeTypesDeps);
		return NextResponse.json({ success: true, count: badges.length, badges });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_badges_list_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminBadgesRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		let body: unknown;
		try {
			body = await readRequestBody(request);
		} catch {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const parsed = createBadgeTypeRequestSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const created = createBadgeType(createBadgeTypeDeps, {
			...parsed.data,
			createdBySteamId64: admin.identity.steamid64
		});
		if (!created.ok) {
			return mapBadgeError(created.error);
		}

		return NextResponse.json({ success: true, badge: created.badge });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_badges_create_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminBadgeStatusRoute(
	request: NextRequest,
	context: BadgeStatusRouteContext
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const badgeTypeId = await readPositiveParam(context.params, 'badgeTypeId');
		if (!badgeTypeId) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		let body: unknown;
		try {
			body = await readRequestBody(request);
		} catch {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const parsed = updateBadgeTypeStatusRequestSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const updated = updateBadgeTypeStatus(updateBadgeTypeStatusDeps, {
			badgeTypeId,
			status: parsed.data.status,
			updatedBySteamId64: admin.identity.steamid64
		});
		if (!updated.ok) {
			return mapBadgeError(updated.error);
		}

		return NextResponse.json({ success: true, badge: updated.badge });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_badges_status_update_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminBadgeDiscordRoleRoute(
	request: NextRequest,
	context: BadgeStatusRouteContext
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const badgeTypeId = await readPositiveParam(context.params, 'badgeTypeId');
		if (!badgeTypeId) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		let body: unknown;
		try {
			body = await readRequestBody(request);
		} catch {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const parsed = updateBadgeTypeDiscordRoleRequestSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const updated = updateBadgeTypeDiscordRole(updateBadgeTypeDiscordRoleDeps, {
			badgeTypeId,
			discordRoleId: parsed.data.discordRoleId,
			updatedBySteamId64: admin.identity.steamid64
		});
		if (!updated.ok) {
			return mapBadgeError(updated.error);
		}

		return NextResponse.json({ success: true, badge: updated.badge });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_badges_discord_role_update_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminUserBadgeRoute(
	request: NextRequest,
	context: UserBadgeRouteContext
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const userId = await readPositiveParam(context.params, 'userId');
		if (!userId) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		let body: unknown;
		try {
			body = await readRequestBody(request);
		} catch {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const parsed = mutateUserBadgeRequestSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const updated = assignUserBadge(assignUserBadgeDeps, {
			userId,
			badgeTypeId: parsed.data.badgeTypeId,
			assignedBySteamId64: admin.identity.steamid64
		});
		if (!updated.ok) {
			return mapBadgeError(updated.error);
		}

		return NextResponse.json({ success: true, badges: updated.badges });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_user_badges_assign_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function deleteAdminUserBadgeRoute(
	request: NextRequest,
	context: UserBadgeRouteContext
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const userId = await readPositiveParam(context.params, 'userId');
		if (!userId) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		let body: unknown;
		try {
			body = await readRequestBody(request);
		} catch {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const parsed = mutateUserBadgeRequestSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const updated = removeUserBadge(removeUserBadgeDeps, {
			userId,
			badgeTypeId: parsed.data.badgeTypeId
		});
		if (!updated.ok) {
			return mapBadgeError(updated.error);
		}

		return NextResponse.json({ success: true, badges: updated.badges });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_user_badges_remove_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
