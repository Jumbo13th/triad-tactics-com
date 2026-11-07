import type { AdminMcpDeps } from '../ports';

export function revokeMcpToken(
	deps: AdminMcpDeps,
	input: { tokenId: number; revokedBySteamid64: string }
): 'revoked' | 'not_found' | 'already_revoked' {
	return deps.tokens.revokeToken({ id: input.tokenId, revokedBySteamid64: input.revokedBySteamid64 });
}
