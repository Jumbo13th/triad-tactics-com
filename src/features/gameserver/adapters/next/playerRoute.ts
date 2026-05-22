import { NextRequest, NextResponse } from 'next/server';
import { getGameserverPlayer } from '../../useCases/getGameserverPlayer';
import { getGameserverPlayerDeps } from '../../deps';
import { logger, errorToLogObject } from '@/platform/logger';

function isAuthorized(request: NextRequest): boolean {
	const secret = process.env.GAMESERVER_API_SECRET?.trim();
	if (!secret) return false;

	const token = (request.nextUrl.searchParams.get('secret') ?? '').trim();
	return token.length > 0 && token === secret;
}

export async function getGameserverPlayerRoute(request: NextRequest): Promise<NextResponse> {
	try {
		if (!isAuthorized(request)) {
			return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
		}

		const armaId = request.nextUrl.searchParams.get('arma_id');
		if (!armaId || !armaId.trim()) {
			return NextResponse.json({ error: 'arma_id_required' }, { status: 400 });
		}

		const result = getGameserverPlayer(getGameserverPlayerDeps, { armaId: armaId.trim() });

		if (!result.success) {
			return NextResponse.json({ error: result.error }, { status: 404 });
		}

		return NextResponse.json(result.player);
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'gameserver_player_lookup_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
