import type { UpdateGameSlottingRequest } from '../domain/requests';
import type { GameAdminMission, GameSlottingDestructiveChange } from '../domain/types';
import type { UpdateGameSlottingDeps } from '../ports';

export type UpdateGameSlottingResult =
	| { ok: true; mission: GameAdminMission }
	| {
			ok: false;
			error:
				| 'not_found'
				| 'slotting_invalid'
				| 'slotting_revision_conflict'
				| 'regular_join_requires_regular_slots'
				| 'destructive_change_requires_confirmation'
				| 'episode_not_found'
				| 'database_error';
			destructiveChanges?: GameSlottingDestructiveChange[];
	  };

export function updateGameSlotting(
	deps: UpdateGameSlottingDeps,
	input: UpdateGameSlottingRequest & { missionId: number; updatedBySteamId64: string }
): UpdateGameSlottingResult {
	const result = deps.repo.updateSlotting(input);
	if (result.success) return { ok: true, mission: result.mission };
	return { ok: false, error: result.error, destructiveChanges: result.destructiveChanges };
}
