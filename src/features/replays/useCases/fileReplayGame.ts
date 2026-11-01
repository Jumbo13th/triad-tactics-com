import { pickEpisode, pickMission } from '../domain/autoLink';
import type { AdminReplaysDeps } from '../ports';
import { importReplayStats } from './reviewReplayGame';

export type FileReplayGameResult = {
	link: 'linked' | 'already_linked' | 'unsure' | 'published' | 'not_found';
	stats: 'imported' | 'episode_has_stats' | 'no_stats' | 'not_linked' | 'failed';
	error?: string;
};

/**
 * Files a game when its server reports it: links it to the mission and episode it was played
 * for when the site can tell, and gives the episode its statistics draft. Nothing is published;
 * an admin still checks and publishes both. A draft already there, perhaps edited, is kept.
 */
export async function fileReplayGame(
	deps: Pick<AdminReplaysDeps, 'repo' | 'objects' | 'importStats'>,
	gameId: number
): Promise<FileReplayGameResult> {
	const game = deps.repo.findGame(gameId);
	const item = deps.repo.findGameListItem(gameId);
	if (!game || !item) return { link: 'not_found', stats: 'not_linked' };
	if (game.publishedAt !== null) return { link: 'published', stats: 'not_linked' };

	let missionId = game.missionId;
	let episodeNumber = game.episodeNumber;
	let link: FileReplayGameResult['link'] = 'already_linked';
	if (missionId === null || episodeNumber === null) {
		const startedAt = item.startedAt;
		missionId = startedAt === null ? null : pickMission(startedAt, deps.repo.listScheduledMissions());
		if (startedAt === null || missionId === null) return { link: 'unsure', stats: 'not_linked' };

		const posts = deps.repo.listEpisodeStartPosts(missionId);
		episodeNumber = pickEpisode(startedAt, posts, deps.repo.countMissionEpisodes(missionId));
		if (episodeNumber === null) return { link: 'unsure', stats: 'not_linked' };

		deps.repo.linkGame(gameId, missionId, episodeNumber);
		link = 'linked';
	}

	if (game.stats === null) return { link, stats: 'no_stats' };
	if (deps.repo.findEpisodeStats(missionId, episodeNumber)) return { link, stats: 'episode_has_stats' };
	const imported = await importReplayStats(deps, { gameId, uploadedBySteamid64: null });
	return imported.ok ? { link, stats: 'imported' } : { link, stats: 'failed', error: imported.error };
}
