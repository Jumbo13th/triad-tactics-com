import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/features/admin/adapters/next/adminAuth';
import { errorToLogObject, logger } from '@/platform/logger';
import { statsDeps } from '../../deps';
import { adminStatsRequestSchema } from '../../domain/requests';
import { buildGameStatsAdminView } from '../../useCases/adminView';
import { uploadSnapshot } from '../../useCases/uploadSnapshot';
import { publishGameStats } from '../../useCases/publishGameStats';
import { closeSeason, createSeason, listSeasons } from '../../useCases/seasons';

const GAMES_PAGE_SIZE = 30;

export async function getAdminStatsRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const gameStatsIdParam = request.nextUrl.searchParams.get('gameStatsId');
		if (gameStatsIdParam) {
			const view = buildGameStatsAdminView(statsDeps, Number(gameStatsIdParam));
			if (!view) return NextResponse.json({ error: 'not_found' }, { status: 404 });
			return NextResponse.json({ view });
		}

		const missionIdParam = request.nextUrl.searchParams.get('missionId');
		if (missionIdParam) {
			return NextResponse.json({ games: statsDeps.repo.listGamesForMission(Number(missionIdParam)) });
		}

		const offsetParam = request.nextUrl.searchParams.get('gamesOffset');
		if (offsetParam !== null) {
			return NextResponse.json({
				games: statsDeps.repo.listGames({ publishedOnly: false, limit: GAMES_PAGE_SIZE, offset: Number(offsetParam) || 0 }),
			});
		}

		return NextResponse.json({
			...listSeasons(statsDeps),
			recentGames: statsDeps.repo.listGames({ publishedOnly: false, limit: GAMES_PAGE_SIZE }),
			missions: statsDeps.repo.listMissionOptions(),
		});
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_get_stats_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminStatsRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const body: unknown = await request.json();
		const parsed = adminStatsRequestSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'validation_error', details: parsed.error.flatten() }, { status: 400 });
		}

		const steamid64 = admin.identity.steamid64;

		switch (parsed.data.action) {
			case 'upload': {
				const result = uploadSnapshot(statsDeps, {
					missionId: parsed.data.missionId,
					episodeNumber: parsed.data.episodeNumber,
					snapshotText: parsed.data.snapshotText,
					replaceDraft: parsed.data.replaceDraft,
					uploadedBySteamid64: steamid64,
				});
				if (!result.success) {
					return NextResponse.json(
						{ error: result.error, existingGameStatsId: result.existingGameStatsId },
						{ status: 400 }
					);
				}
				return NextResponse.json({ gameStatsId: result.gameStatsId, view: result.view });
			}
			case 'updateMapping': {
				const meta = statsDeps.repo.getMeta(parsed.data.gameStatsId);
				if (!meta) return NextResponse.json({ error: 'not_found' }, { status: 404 });

				statsDeps.repo.updateMapping(parsed.data.gameStatsId, parsed.data.mapping);

				const view = buildGameStatsAdminView(statsDeps, parsed.data.gameStatsId);
				return NextResponse.json({ view });
			}
			case 'publish': {
				const result = publishGameStats(statsDeps, {
					gameStatsId: parsed.data.gameStatsId,
					publishedBySteamid64: steamid64,
				});
				if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
				return NextResponse.json({ seasonId: result.seasonId, rowCount: result.rowCount });
			}
			case 'unpublish': {
				const meta = statsDeps.repo.getMeta(parsed.data.gameStatsId);
				if (!meta) return NextResponse.json({ error: 'not_found' }, { status: 404 });
				statsDeps.repo.unpublish(parsed.data.gameStatsId);
				return NextResponse.json({ ok: true });
			}
			case 'deleteDraft': {
				const meta = statsDeps.repo.getMeta(parsed.data.gameStatsId);
				if (!meta) return NextResponse.json({ error: 'not_found' }, { status: 404 });
				if (!statsDeps.repo.deleteDraft(parsed.data.gameStatsId)) {
					return NextResponse.json({ error: 'not_draft' }, { status: 400 });
				}
				return NextResponse.json({ ok: true });
			}
			case 'createSeason': {
				const result = createSeason(statsDeps, { name: parsed.data.name, createdBySteamid64: steamid64 });
				if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
				return NextResponse.json({ season: result.season });
			}
			case 'closeSeason': {
				const result = closeSeason(statsDeps, { seasonId: parsed.data.seasonId });
				if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
				return NextResponse.json({ ok: true });
			}
			default: {
				const _exhaustive: never = parsed.data;
				return NextResponse.json({ error: 'invalid_action', _exhaustive }, { status: 400 });
			}
		}
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_post_stats_route_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
