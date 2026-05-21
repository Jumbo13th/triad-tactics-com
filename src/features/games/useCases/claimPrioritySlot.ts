import type { ClaimPrioritySlotDeps } from '../ports';

export type ClaimPrioritySlotResult =
	| { ok: true }
	| {
			ok: false;
			error:
				| 'mission_not_found'
				| 'slot_not_found'
				| 'claim_closed'
				| 'slot_taken'
				| 'claim_conflict'
				| 'already_has_slot'
				| 'badge_required'
				| 'database_error';
	  };

export function claimPrioritySlot(
	deps: ClaimPrioritySlotDeps,
	input: { shortCode: string; slotId: string; steamId64: string; episodeNumber: number }
): ClaimPrioritySlotResult {
	const result = deps.repo.claimPrioritySlot(input);
	if (result.success) return { ok: true };
	return { ok: false, error: result.error };
}
