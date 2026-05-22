import type { UpdateSanctionExpiryDeps, UpdateSanctionExpiryRepoResult } from '../ports';

export type UpdateSanctionExpiryInput = {
	sanctionId: number;
	newExpiresAt: string | null;
	updatedBySteamId64: string;
};

export function updateSanctionExpiry(
	deps: UpdateSanctionExpiryDeps,
	input: UpdateSanctionExpiryInput
): UpdateSanctionExpiryRepoResult {
	return deps.repo.updateSanctionExpiry({
		sanctionId: input.sanctionId,
		newExpiresAt: input.newExpiresAt,
		updatedBySteamId64: input.updatedBySteamId64
	});
}
