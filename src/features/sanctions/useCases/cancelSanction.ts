import type { CancelSanctionDeps, CancelSanctionRepoResult } from '../ports';

export type CancelSanctionInput = {
	sanctionId: number;
	cancelledBySteamId64: string;
	cancelledReason: string;
};

export function cancelSanction(
	deps: CancelSanctionDeps,
	input: CancelSanctionInput
): CancelSanctionRepoResult {
	return deps.repo.cancelSanction({
		sanctionId: input.sanctionId,
		cancelledBySteamId64: input.cancelledBySteamId64,
		cancelledReason: input.cancelledReason
	});
}
