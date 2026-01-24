import type { SubmitRenameRequestDeps } from '../ports';

export type SubmitRenameRequestInput = {
	steamid64: string;
	callsign: string;
};

export type SubmitRenameRequestResult =
	| { ok: true; status: 'created'; requestId: unknown }
	| { ok: true; status: 'already_pending' }
	| {
			ok: false;
			error:
				| 'callsign_taken'
				| 'rename_not_required'
				| 'duplicate_pending'
				| 'not_found'
				| 'database_error';
	  };

export function submitRenameRequest(
	deps: SubmitRenameRequestDeps,
	input: SubmitRenameRequestInput
): SubmitRenameRequestResult {
	const ensured = deps.users.getOrCreateUserBySteamId64({ steamid64: input.steamid64 });
	if (!ensured.success) {
		return { ok: false, error: 'database_error' };
	}

	const userId = ensured.user.id;
	if (deps.renameRequests.hasPendingByUserId(userId)) {
		return { ok: true, status: 'already_pending' };
	}

	if (deps.callsigns.hasExactMatch(input.callsign)) {
		return { ok: false, error: 'callsign_taken' };
	}

	const created = deps.renameRequests.createRenameRequest({
		userId,
		newCallsign: input.callsign
	});

	if (created.success) {
		return { ok: true, status: 'created', requestId: created.id };
	}

	switch (created.error) {
		case 'rename_not_required':
			return { ok: false, error: 'rename_not_required' };
		case 'duplicate_pending':
			return { ok: false, error: 'duplicate_pending' };
		case 'not_found':
			return { ok: false, error: 'not_found' };
		default:
			return { ok: false, error: 'database_error' };
	}
}
