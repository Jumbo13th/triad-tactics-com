import type { AdminMcpDeps } from '../ports';
import { isWellFormedMcpToken, type McpPrincipal } from '../domain/types';

export type AuthenticateMcpTokenResult =
	| { ok: true; principal: McpPrincipal }
	| { ok: false; error: 'invalid_token' | 'not_admin' };

export function authenticateMcpToken(deps: AdminMcpDeps, token: string | null): AuthenticateMcpTokenResult {
	if (!token || !isWellFormedMcpToken(token)) return { ok: false, error: 'invalid_token' };

	const row = deps.tokens.findActiveTokenByHash(deps.secrets.hashToken(token));
	if (!row) return { ok: false, error: 'invalid_token' };

	// Removing someone from ADMIN_STEAM_IDS must cut off their tokens immediately.
	if (!deps.admin.isAdminSteamId(row.steamid64)) return { ok: false, error: 'not_admin' };

	deps.tokens.touchToken(row.id);
	return { ok: true, principal: { tokenId: row.id, steamid64: row.steamid64, label: row.label } };
}
