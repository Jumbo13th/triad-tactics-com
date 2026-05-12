import type { UpdateUnitAssignmentsRequest } from '../domain/requests';
import type { GameAdminMission } from '../domain/types';
import type { UpdateUnitAssignmentsDeps } from '../ports';

export type UpdateUnitAssignmentsResult =
	| { ok: true; mission: GameAdminMission }
	| {
			ok: false;
			error: 'not_found' | 'invalid_side_id' | 'invalid_unit' | 'database_error';
	  };

export function updateUnitAssignments(
	deps: UpdateUnitAssignmentsDeps,
	input: UpdateUnitAssignmentsRequest & { missionId: number; updatedBySteamId64: string }
): UpdateUnitAssignmentsResult {
	const result = deps.repo.updateUnitAssignments(input);
	if (result.success) return { ok: true, mission: result.mission };
	return { ok: false, error: result.error };
}
