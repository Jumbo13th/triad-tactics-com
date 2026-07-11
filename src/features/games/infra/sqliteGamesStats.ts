import { getDb } from '@/platform/db/connection';
import { getMissionParticipationUser } from './sqliteGamesShared';

/**
 * Counts archived+completed missions where the user either held a slot
 * (occupant.userId inside any episode's slotting JSON) or had a regular join.
 */
export function countCompletedGameParticipations(input: { steamId64: string }): number {
	const db = getDb();
	try {
		const user = getMissionParticipationUser(db, input.steamId64);
		if (!user) return 0;

		const row = db
			.prepare(`
				SELECT COUNT(*) AS played
				FROM missions m
				WHERE m.status = 'archived'
					AND m.archive_status = 'completed'
					AND (
						EXISTS (
							SELECT 1
							FROM mission_regular_joins j
							WHERE j.mission_id = m.id AND j.user_id = ?
						)
						OR EXISTS (
							SELECT 1
							FROM mission_episode_slotting es, json_tree(es.slotting_json) jt
							WHERE es.mission_id = m.id
								AND jt.key = 'userId'
								AND jt.path LIKE '%.occupant'
								AND jt.value = ?
						)
					)
			`)
			.get(user.id, user.id) as { played: number } | undefined;

		return row?.played ?? 0;
	} catch {
		return 0;
	}
}

/**
 * True when the user is an accepted squad member (any unit role except
 * 'applicant') or has at least one badge assigned.
 */
export function userIsInSquadOrHasBadge(input: { steamId64: string }): boolean {
	const db = getDb();
	try {
		const user = getMissionParticipationUser(db, input.steamId64);
		if (!user) return false;

		const row = db
			.prepare(`
				SELECT
					EXISTS (
						SELECT 1 FROM unit_memberships um
						WHERE um.user_id = ? AND um.role IN ('member', 'deputy', 'leader')
					)
					OR EXISTS (
						SELECT 1 FROM user_badges ub
						WHERE ub.user_id = ?
					) AS standing
			`)
			.get(user.id, user.id) as { standing: number } | undefined;

		return row?.standing === 1;
	} catch {
		return false;
	}
}
