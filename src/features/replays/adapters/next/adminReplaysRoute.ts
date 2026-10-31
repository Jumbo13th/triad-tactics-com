import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/features/admin/adapters/next/adminAuth';
import { errorToLogObject, logger } from '@/platform/logger';
import { adminReplaysDeps } from '../../deps';
import { adminReplayRequestSchema } from '../../domain/requests';
import { listReplayGames } from '../../useCases/listReplayGames';
import {
	getReplayGameDetail,
	importReplayStats,
	linkReplayGame,
	publishReplayGame,
	unpublishReplayGame,
} from '../../useCases/reviewReplayGame';
import { setReplayMap } from '../../useCases/uploadMap';

const GAMES_PAGE_SIZE = 50;

export async function getAdminReplaysRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const gameIdParam = request.nextUrl.searchParams.get('gameId');
		if (gameIdParam !== null) {
			const detail = getReplayGameDetail(adminReplaysDeps, Number(gameIdParam));
			if (!detail) return NextResponse.json({ error: 'not_found' }, { status: 404 });
			return NextResponse.json(detail);
		}

		const offset = Math.max(0, Math.floor(Number(request.nextUrl.searchParams.get('offset')) || 0));
		const games = listReplayGames(adminReplaysDeps, { limit: GAMES_PAGE_SIZE + 1, offset });
		return NextResponse.json({ games: games.slice(0, GAMES_PAGE_SIZE), hasMore: games.length > GAMES_PAGE_SIZE });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_get_replays_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminReplaysRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
		}
		const parsed = adminReplayRequestSchema.safeParse(body);
		if (!parsed.success) return NextResponse.json({ error: 'validation_error' }, { status: 400 });

		const steamid64 = admin.identity.steamid64;
		const input = parsed.data;
		switch (input.action) {
			case 'link': {
				const result = linkReplayGame(adminReplaysDeps, input);
				if (result !== 'linked') return NextResponse.json({ error: result }, { status: result === 'not_found' ? 404 : 400 });
				return NextResponse.json({ ok: true });
			}
			case 'importStats': {
				const result = await importReplayStats(adminReplaysDeps, { gameId: input.gameId, uploadedBySteamid64: steamid64 });
				if (!result.ok) {
					if (result.error === 'storage_unavailable') logger.warn({ gameId: input.gameId }, 'replay_stats_import_unavailable');
					return NextResponse.json({ error: result.error }, { status: result.error === 'not_found' ? 404 : 400 });
				}
				logger.info({ gameId: input.gameId, gameStatsId: result.gameStatsId }, 'replay_stats_imported');
				return NextResponse.json({ gameStatsId: result.gameStatsId });
			}
			case 'publish': {
				const result = await publishReplayGame(adminReplaysDeps, { gameId: input.gameId, publishedBySteamid64: steamid64 });
				if (result.result !== 'published') {
					return NextResponse.json({ error: result.result }, { status: result.result === 'not_found' ? 404 : 400 });
				}
				if (result.announcement === 'failed') {
					logger.error({ gameId: input.gameId, ...errorToLogObject(result.error) }, 'replay_announce_failed');
				}
				logger.info({ gameId: input.gameId, announcement: result.announcement }, 'replay_published');
				return NextResponse.json({ ok: true, announcement: result.announcement });
			}
			case 'unpublish': {
				const result = unpublishReplayGame(adminReplaysDeps, input.gameId);
				if (result !== 'unpublished') return NextResponse.json({ error: result }, { status: 404 });
				logger.info({ gameId: input.gameId }, 'replay_unpublished');
				return NextResponse.json({ ok: true });
			}
			case 'setMap': {
				setReplayMap(adminReplaysDeps, {
					world: input.world,
					relief: input.relief,
					topo: input.topo,
					updatedBySteamid64: steamid64,
				});
				logger.info({ world: input.world, relief: input.relief, topo: input.topo }, 'replay_map_set');
				return NextResponse.json({ ok: true });
			}
			default: {
				const _exhaustive: never = input;
				return NextResponse.json({ error: 'invalid_action', _exhaustive }, { status: 400 });
			}
		}
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_post_replays_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
