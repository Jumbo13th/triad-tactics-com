import type { ListRenameRequestsDeps } from '../ports';

export type DecideRenameRequestResult =
	| { ok: true }
	| { ok: false; error: 'not_found' | 'not_pending' | 'database_error' };

export function decideRenameRequest(
	deps: ListRenameRequestsDeps<unknown>,
	input: {
		requestId: number;
		decision: 'approve' | 'decline';
		decidedBySteamId64: string;
		declineReason?: string | null;
	}
): DecideRenameRequestResult {
	const result = deps.repo.decideRenameRequest(input);
	if (result.success) return { ok: true };
	return { ok: false, error: result.error };
}
