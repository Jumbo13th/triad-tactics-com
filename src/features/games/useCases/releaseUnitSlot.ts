import type { ReleaseUnitSlotDeps } from '../ports';

export type ReleaseUnitSlotResult =
	| { ok: true }
	| {
			ok: false;
			error:
				| 'mission_not_found'
				| 'unit_slotting_closed'
				| 'not_unit_leader'
				| 'slot_not_found'
				| 'not_your_unit_slot'
				| 'release_conflict'
				| 'database_error';
	  };

export function releaseUnitSlot(
	deps: ReleaseUnitSlotDeps,
	input: { shortCode: string; slotId: string; steamId64: string }
): ReleaseUnitSlotResult {
	const result = deps.repo.releaseUnitSlot(input);
	if (result.success) return { ok: true };
	return { ok: false, error: result.error };
}
