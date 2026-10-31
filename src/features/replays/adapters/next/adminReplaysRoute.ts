import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/features/admin/adapters/next/adminAuth';
import { errorToLogObject, logger } from '@/platform/logger';
import { adminReplaysDeps } from '../../deps';
import { listReplayGames } from '../../useCases/listReplayGames';

const GAMES_PAGE_SIZE = 50;

export async function getAdminReplaysRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const offset = Math.max(0, Math.floor(Number(request.nextUrl.searchParams.get('offset')) || 0));
		const games = listReplayGames(adminReplaysDeps, { limit: GAMES_PAGE_SIZE + 1, offset });
		return NextResponse.json({ games: games.slice(0, GAMES_PAGE_SIZE), hasMore: games.length > GAMES_PAGE_SIZE });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_get_replays_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
