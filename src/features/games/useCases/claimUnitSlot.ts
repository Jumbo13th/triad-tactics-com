import type { ClaimUnitSlotDeps } from '../ports';

export type ClaimUnitSlotResult =
	| { ok: true }
	| {
			ok: false;
			error:
				| 'mission_not_found'
				| 'unit_slotting_closed'
				| 'not_unit_leader'
				| 'unit_not_assigned'
				| 'slot_not_found'
				| 'wrong_side'
				| 'slot_taken'
				| 'slots_exhausted'
				| 'claim_conflict'
				| 'database_error';
	  };

export function claimUnitSlot(
	deps: ClaimUnitSlotDeps,
	input: { shortCode: string; slotId: string; steamId64: string; episodeNumber: number }
): ClaimUnitSlotResult {
	const result = deps.repo.claimUnitSlot(input);
	if (result.success) return { ok: true };
	return { ok: false, error: result.error };
}
