import type { ConfirmApplicationDeps } from '../ports';

export type ConfirmApplicationResult =
	| { ok: true }
	| { ok: false; error: 'not_found' | 'database_error' };

export function confirmApplication(
	deps: ConfirmApplicationDeps,
	input: { applicationId: number; confirmedBySteamId64: string }
): ConfirmApplicationResult {
	const result = deps.repo.confirmApplication(input.applicationId, input.confirmedBySteamId64);
	if (result.success) return { ok: true };
	return { ok: false, error: result.error };
}
