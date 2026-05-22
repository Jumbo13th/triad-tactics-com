import type { CheckSiteBanDeps } from '../ports';
import type { Sanction } from '../domain/types';

export function checkSiteBan(
	deps: CheckSiteBanDeps,
	input: { userId: number }
): Sanction | null {
	return deps.repo.getActiveSiteBanForUser({ userId: input.userId });
}
