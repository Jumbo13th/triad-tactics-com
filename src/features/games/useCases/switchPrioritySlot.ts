import type { SwitchPrioritySlotDeps } from '../ports';

export type SwitchPrioritySlotResult =
	| { ok: true }
	| {
			ok: false;
			error:
				| 'mission_not_found'
				| 'slot_not_found'
				| 'claim_closed'
				| 'slot_taken'
				| 'no_current_slot'
				| 'already_in_slot'
				| 'switch_conflict'
				| 'database_error';
	  };

export function switchPrioritySlot(
	deps: SwitchPrioritySlotDeps,
	input: { shortCode: string; slotId: string; steamId64: string; episodeNumber: number }
): SwitchPrioritySlotResult {
	const result = deps.repo.switchPrioritySlot(input);
	if (result.success) return { ok: true };
	return { ok: false, error: result.error };
}
