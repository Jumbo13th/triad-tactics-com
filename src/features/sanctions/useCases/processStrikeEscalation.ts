import type { ProcessStrikeEscalationDeps, ProcessStrikeEscalationRepoResult } from '../ports';

export function processStrikeEscalation(
	deps: ProcessStrikeEscalationDeps,
	input: { createdBySteamId64: string }
): ProcessStrikeEscalationRepoResult {
	return deps.repo.processStrikeEscalation({ createdBySteamId64: input.createdBySteamId64 });
}
