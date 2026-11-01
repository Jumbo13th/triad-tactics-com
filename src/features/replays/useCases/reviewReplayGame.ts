import { forEachInflatedLine, inflateText } from '../domain/encoding';
import { createPlayerIndex } from '../domain/players';
import type { ReplayGameDetail, ReplayGameRecord, ReplayMission } from '../domain/types';
import type { AdminReplaysDeps, StatsImportResult } from '../ports';

export function getReplayGameDetail(
	deps: Pick<AdminReplaysDeps, 'repo'>,
	gameId: number
): { game: ReplayGameDetail; missions: ReplayMission[] } | null {
	const item = deps.repo.findGameListItem(gameId);
	const record = deps.repo.findGame(gameId);
	if (!item || !record) return null;

	const statistics =
		record.missionId !== null && record.episodeNumber !== null
			? deps.repo.findEpisodeStats(record.missionId, record.episodeNumber)
			: null;
	const map = item.world ? deps.repo.findMap(item.world) : null;
	return {
		game: {
			...item,
			announcedAt: record.announcedAt,
			statistics,
			hasMap: Boolean(map?.reliefSha256 || map?.topoSha256),
			map: { relief: Boolean(map?.reliefSha256), topo: Boolean(map?.topoSha256) },
		},
		missions: deps.repo.listMissions(),
	};
}

export type LinkReplayGameResult = 'linked' | 'not_found' | 'mission_not_found' | 'published';

// A published game's link decides where viewers find it, so it is only changed while hidden.
export function linkReplayGame(
	deps: Pick<AdminReplaysDeps, 'repo'>,
	input: { gameId: number; missionId: number; episodeNumber: number }
): LinkReplayGameResult {
	const game = deps.repo.findGame(input.gameId);
	if (!game) return 'not_found';
	if (game.publishedAt !== null) return 'published';
	if (!deps.repo.findMission(input.missionId)) return 'mission_not_found';
	deps.repo.linkGame(input.gameId, input.missionId, input.episodeNumber);
	return 'linked';
}

/** Hands the game's statistics file to the statistics admin as the episode's draft. */
export async function importReplayStats(
	deps: AdminReplaysDeps,
	input: { gameId: number; uploadedBySteamid64: string }
): Promise<StatsImportResult> {
	const game = deps.repo.findGame(input.gameId);
	if (!game) return { ok: false, error: 'not_found' };
	if (game.missionId === null || game.episodeNumber === null) return { ok: false, error: 'not_linked' };
	if (game.stats === null) return { ok: false, error: 'no_stats' };

	const file = deps.repo.findFile(game.stats);
	if (!file || !deps.objects.isConfigured()) return { ok: false, error: 'storage_unavailable' };
	const encoded = await deps.objects.read(file.storageKey);
	const text = encoded ? await inflateText(encoded, file.size, file.sha256) : null;
	if (text === null) return { ok: false, error: 'storage_unavailable' };

	return deps.importStats({
		missionId: game.missionId,
		episodeNumber: game.episodeNumber,
		snapshotText: text,
		uploadedBySteamid64: input.uploadedBySteamid64,
	});
}

export type IndexReplayPlayersResult =
	| { result: 'indexed' }
	| { result: 'failed'; reason: 'storage_unavailable' | 'unreadable' | 'error'; error?: unknown };

// The list finds a published game by who played it. The index is rebuilt from the stored
// files on every publish, so publishing again repairs one that failed or went stale.
async function indexReplayPlayers(
	deps: Pick<AdminReplaysDeps, 'repo' | 'objects'>,
	game: ReplayGameRecord
): Promise<IndexReplayPlayersResult> {
	try {
		if (!deps.objects.isConfigured()) return { result: 'failed', reason: 'storage_unavailable' };
		const sha256s = game.identity === null ? game.segments : [game.identity, ...game.segments];
		const files = new Map(deps.repo.findFiles(sha256s).map((file) => [file.sha256, file]));
		const index = createPlayerIndex();
		for (const sha256 of sha256s) {
			const file = files.get(sha256);
			const encoded = file ? await deps.objects.read(file.storageKey) : null;
			if (!file || !encoded) return { result: 'failed', reason: 'storage_unavailable' };
			const read = file.kind === 'identity' ? index.readIdentityLine : index.readSegmentLine;
			if (!(await forEachInflatedLine(encoded, file.size, file.sha256, read))) return { result: 'failed', reason: 'unreadable' };
		}
		deps.repo.replaceGamePlayers(game.id, index.players());
		return { result: 'indexed' };
	} catch (error: unknown) {
		return { result: 'failed', reason: 'error', error };
	}
}

export type PublishReplayGameResult =
	| {
			result: 'published';
			announcement: 'sent' | 'skipped' | 'earlier' | 'failed';
			error?: unknown;
			players: IndexReplayPlayersResult;
	  }
	| { result: 'not_found' }
	| { result: 'not_linked' };

// The Discord post goes out on the first publish only; a publish that fails to post still
// publishes, and the next publish tries the post again. A game whose players cannot be
// indexed is published all the same: search just cannot find it by player yet.
export async function publishReplayGame(
	deps: Pick<AdminReplaysDeps, 'repo' | 'objects' | 'announce'>,
	input: { gameId: number; publishedBySteamid64: string }
): Promise<PublishReplayGameResult> {
	const game = deps.repo.findGame(input.gameId);
	if (!game) return { result: 'not_found' };
	if (game.missionId === null || game.episodeNumber === null) return { result: 'not_linked' };
	const mission = deps.repo.findMission(game.missionId);
	if (!mission) return { result: 'not_linked' };

	deps.repo.setPublished(game.id, input.publishedBySteamid64);
	const players = await indexReplayPlayers(deps, game);
	if (game.announcedAt !== null) return { result: 'published', announcement: 'earlier', players };

	const stats = deps.repo.findEpisodeStats(game.missionId, game.episodeNumber);
	try {
		const sent = await deps.announce({
			gameId: game.id,
			missionTitle: mission.title,
			missionShortCode: mission.shortCode,
			episodeNumber: game.episodeNumber,
			statsId: stats?.status === 'published' ? stats.id : null,
		});
		if (sent === 'sent') deps.repo.markAnnounced(game.id);
		return { result: 'published', announcement: sent, players };
	} catch (error: unknown) {
		return { result: 'published', announcement: 'failed', error, players };
	}
}

export function unpublishReplayGame(deps: Pick<AdminReplaysDeps, 'repo'>, gameId: number): 'unpublished' | 'not_found' {
	if (!deps.repo.findGame(gameId)) return 'not_found';
	deps.repo.setPublished(gameId, null);
	return 'unpublished';
}
