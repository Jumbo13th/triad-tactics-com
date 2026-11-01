// Which mission and episode a game belongs to, guessed when its server reports it so that most
// games arrive filed and an admin only checks them. Any doubt leaves the game for an admin.

/** Servers load the mission up to this long before its announced start… */
const LOADED_AHEAD = 2 * 3600;
/** …and the last episode of an evening can start this long after it. */
const EVENING = 10 * 3600;
/** An admin posts "episode N started" once slotting and the briefing are over. */
const POSTED_EARLY = 15 * 60;
const POSTED_LATE = 90 * 60;

/** Times are seconds since the epoch. */
export type TimedMission = { id: number; startsAt: number };
export type EpisodeStartPost = { episodeNumber: number; at: number };

/** The one mission announced around the game's start; null when there is none, or several. */
export function pickMission(startedAt: number, missions: TimedMission[]): number | null {
	const near = missions.filter((m) => startedAt >= m.startsAt - LOADED_AHEAD && startedAt <= m.startsAt + EVENING);
	return near.length === 1 ? near[0].id : null;
}

/**
 * The episode whose start post is the first to follow the game's start. A mission of one
 * episode needs no post; a longer one without a fitting post is left for an admin.
 */
export function pickEpisode(startedAt: number, posts: EpisodeStartPost[], episodeCount: number): number | null {
	const next = posts
		.filter((p) => p.at >= startedAt - POSTED_EARLY && p.at <= startedAt + POSTED_LATE)
		.sort((a, b) => a.at - b.at)[0];
	if (next) return next.episodeNumber;
	return episodeCount <= 1 ? 1 : null;
}
