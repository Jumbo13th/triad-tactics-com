import type { RenameRequiredDeps } from '../ports';

export type SetRenameRequiredResult =
	| { ok: true }
	| { ok: false; error: 'not_found' | 'not_confirmed' | 'rename_already_required' | 'rename_request_pending' | 'database_error' };

export function setRenameRequired(
	deps: RenameRequiredDeps,
	input: { steamid64: string; requestedBySteamId64: string; reason?: string | null }
): SetRenameRequiredResult {
	const user = deps.repo.getUserBySteamId64(input.steamid64);
	if (!user) return { ok: false, error: 'not_found' };
	if (!user.player_confirmed_at) return { ok: false, error: 'not_confirmed' };
	if (user.rename_required_at) return { ok: false, error: 'rename_already_required' };
	if (deps.repo.hasPendingRenameRequestByUserId(user.id)) {
		return { ok: false, error: 'rename_request_pending' };
	}

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
