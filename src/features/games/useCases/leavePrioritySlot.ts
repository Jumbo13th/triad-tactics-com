import type { LeavePrioritySlotDeps } from '../ports';

export type LeavePrioritySlotResult =
	| { ok: true; left: boolean }
	| {
			ok: false;
			error: 'mission_not_found' | 'no_current_slot' | 'leave_conflict' | 'database_error';
	  };

export function leavePrioritySlot(
	deps: LeavePrioritySlotDeps,
	input: { shortCode: string; steamId64: string; episodeNumber: number }
): LeavePrioritySlotResult {
	const result = deps.repo.leavePrioritySlot(input);
	if (result.success) return { ok: true, left: result.left };
	return { ok: false, error: result.error };
}
