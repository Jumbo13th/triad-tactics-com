import type { GetIsEstablishedPlayerDeps } from '../ports';

export const ESTABLISHED_GAMES_THRESHOLD = 3;

/**
 * An established player is an accepted squad member, a badge holder, or
 * someone who took part in at least ESTABLISHED_GAMES_THRESHOLD completed games.
 * Newcomers (everyone else) get onboarding content in a more prominent spot.
 */
export function getIsEstablishedPlayer(deps: GetIsEstablishedPlayerDeps, steamId64: string): boolean {
	return (
		deps.repo.userIsInSquadOrHasBadge({ steamId64 }) ||
		deps.repo.countCompletedGameParticipations({ steamId64 }) >= ESTABLISHED_GAMES_THRESHOLD
	);
}
