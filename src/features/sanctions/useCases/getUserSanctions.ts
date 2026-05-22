import type { GetUserSanctionsDeps } from '../ports';
import type { PublicSanctionEntry } from '../domain/types';

export function getUserSanctions(
	deps: GetUserSanctionsDeps,
	input: { userId: number }
): PublicSanctionEntry[] {
	return deps.repo.getSanctionsForUser({ userId: input.userId });
}
