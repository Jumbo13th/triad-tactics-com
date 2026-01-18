import type { RenameRequiredDeps } from '../ports';

export type SetRenameRequiredResult =
	| { ok: true }
	| { ok: false; error: 'database_error' };

export function setRenameRequired(
	deps: RenameRequiredDeps,
	input: { steamid64: string; requestedBySteamId64: string; reason?: string | null }
): SetRenameRequiredResult {
	const result = deps.repo.setUserRenameRequired(input);
	if (result.success) return { ok: true };
	return { ok: false, error: 'database_error' };
}

export type ClearRenameRequiredResult =
	| { ok: true }
	| { ok: false; error: 'database_error' };

export function clearRenameRequired(
	deps: RenameRequiredDeps,
	input: { steamid64: string }
): ClearRenameRequiredResult {
	const result = deps.repo.clearUserRenameRequired(input.steamid64);
	if (result.success) return { ok: true };
	return { ok: false, error: 'database_error' };
}
