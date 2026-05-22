import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/features/admin/adapters/next/adminAuth';
import { rotationDeps } from '@/features/rotation/deps';
import { getRotationUseCase } from '@/features/rotation/useCases/getRotation';
import { updateRotationConfigUseCase } from '@/features/rotation/useCases/updateRotationConfig';
import { updateRotationSidesUseCase } from '@/features/rotation/useCases/updateRotationSides';
import { updateCommanderScheduleUseCase } from '@/features/rotation/useCases/updateCommanderSchedule';
import { updateRotationRequestSchema } from '@/features/rotation/domain/requests';
import { errorToLogObject, logger } from '@/platform/logger';

export async function getAdminRotationRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const result = getRotationUseCase(rotationDeps);
		return NextResponse.json(result.json, { status: result.status });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_get_rotation_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function putAdminRotationRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const body: unknown = await request.json();
		const parsed = updateRotationRequestSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'validation_error', details: parsed.error.flatten() }, { status: 400 });
		}

		const steamid64 = admin.identity.steamid64;

		switch (parsed.data.action) {
			case 'updateConfig': {
				const result = updateRotationConfigUseCase(rotationDeps, { ...parsed.data, updatedBySteamid64: steamid64 });
				return NextResponse.json(result.json, { status: result.status });
			}
			case 'updateSides': {
				const result = updateRotationSidesUseCase(rotationDeps, { ...parsed.data, updatedBySteamid64: steamid64 });
				return NextResponse.json(result.json, { status: result.status });
			}
			case 'updateCommanderSchedule': {
				const result = updateCommanderScheduleUseCase(rotationDeps, { ...parsed.data, updatedBySteamid64: steamid64 });
				return NextResponse.json(result.json, { status: result.status });
			}
			default: {
				const _exhaustive: never = parsed.data;
				return NextResponse.json({ error: 'invalid_action', _exhaustive }, { status: 400 });
			}
		}
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_put_rotation_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
