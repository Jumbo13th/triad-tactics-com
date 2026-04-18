import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { unitDeps } from '@/features/units/deps';
import { uploadAvatar, deleteAvatar } from '@/features/units/useCases/unitAvatar';
import { requireConnectedUser, readUnitId, type UnitRouteContext } from './unitRouteHelpers';
import { errorToLogObject, logger } from '@/platform/logger';

const ALLOWED_AVATAR_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export async function getAvatarRoute(request: NextRequest, context: UnitRouteContext): Promise<NextResponse> {
	try {
		const unitId = await readUnitId(context);
		if (!unitId) return NextResponse.json({ error: 'invalid_unit_id' }, { status: 400 });

		const avatar = unitDeps.repo.getUnitAvatar(unitId);
		if (!avatar) return new NextResponse(null, { status: 404 });

		const mime = ALLOWED_AVATAR_MIMES.has(avatar.mime) ? avatar.mime : 'image/png';
		const etag = `W/\"${createHash('sha1').update(avatar.data).digest('hex')}\"`;
		const cacheControl = 'public, no-cache, max-age=0, must-revalidate';
		if (request.headers.get('if-none-match') === etag) {
			return new NextResponse(null, {
				status: 304,
				headers: {
					ETag: etag,
					'Cache-Control': cacheControl,
					Vary: 'Accept-Encoding'
				}
			});
		}

		const buffer = Buffer.from(avatar.data, 'base64');
		return new NextResponse(buffer, {
			status: 200,
			headers: {
				'Content-Type': mime,
				ETag: etag,
				'X-Content-Type-Options': 'nosniff',
				'Content-Security-Policy': "default-src 'none'; style-src 'none'; script-src 'none'",
				'Cache-Control': cacheControl,
				Vary: 'Accept-Encoding'
			}
		});
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'get_avatar_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postUploadAvatarRoute(request: NextRequest, context: UnitRouteContext): Promise<NextResponse> {
	try {
		const auth = requireConnectedUser(request);
		if (!auth.ok) return auth.response;

		const unitId = await readUnitId(context);
		if (!unitId) return NextResponse.json({ error: 'invalid_unit_id' }, { status: 400 });

		const body: unknown = await request.json();
		const result = uploadAvatar(unitDeps, {
			unitId,
			body,
			steamid64: auth.identity.steamid64,
			isAdmin: auth.isAdmin
		});
		return NextResponse.json(result.json, { status: result.status });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'upload_avatar_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function deleteAvatarRoute(request: NextRequest, context: UnitRouteContext): Promise<NextResponse> {
	try {
		const auth = requireConnectedUser(request);
		if (!auth.ok) return auth.response;

		const unitId = await readUnitId(context);
		if (!unitId) return NextResponse.json({ error: 'invalid_unit_id' }, { status: 400 });

		const result = deleteAvatar(unitDeps, {
			unitId,
			steamid64: auth.identity.steamid64,
			isAdmin: auth.isAdmin
		});
		return NextResponse.json(result.json, { status: result.status });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'delete_avatar_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
