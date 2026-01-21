import { checkCallsign } from '@/features/callsign/useCases/checkCallsign';
import { callsignDeps } from '@/features/callsign/deps';
import { createRenameRequest, hasPendingRenameRequestByUserId } from '@/features/rename/infra/sqliteRenameRequests';
import { getOrCreateUserBySteamId64 } from '@/features/users/infra/sqliteUsers';
import type { SubmitRenameRequestDeps } from './ports';

export const submitRenameRequestDeps: SubmitRenameRequestDeps = {
	users: {
		getOrCreateUserBySteamId64
	},
	renameRequests: {
		hasPendingByUserId: hasPendingRenameRequestByUserId,
		createRenameRequest
	},
	callsigns: {
		hasExactMatch: (callsign) => {
			const result = checkCallsign(callsignDeps, { callsign });
			return result.ok && result.exactMatches.length > 0;
		}
	}
};
