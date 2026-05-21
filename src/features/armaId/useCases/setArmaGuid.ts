import type { SetArmaGuidDeps } from '../ports';

export type SetArmaGuidInput = {
	steamid64: string;
	armaGuid: string;
};

export type SetArmaGuidResult =
	| { ok: true }
	| { ok: false; error: 'duplicate' | 'not_found' | 'database_error' };

export function setArmaGuid(
	deps: SetArmaGuidDeps,
	input: SetArmaGuidInput
): SetArmaGuidResult {
	const ensured = deps.users.getOrCreateUserBySteamId64({ steamid64: input.steamid64 });
	if (!ensured.success) {
		return { ok: false, error: 'database_error' };
	}

	const userId = ensured.user.id;

	if (deps.users.isArmaGuidTaken(input.armaGuid, userId)) {
		return { ok: false, error: 'duplicate' };
	}

	const result = deps.users.setArmaGuidByUserId({ userId, armaGuid: input.armaGuid });
	if (!result.success) {
		return { ok: false, error: result.error };
	}

	return { ok: true };
}
