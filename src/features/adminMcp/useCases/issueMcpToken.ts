import type { AdminMcpDeps } from '../ports';
import type { CreateMcpTokenRequest } from '../domain/requests';
import { MAX_ACTIVE_MCP_TOKENS_PER_ADMIN, MCP_TOKEN_HINT_LENGTH, type McpTokenSummary } from '../domain/types';

export type IssueMcpTokenResult =
	| { ok: true; token: string; summary: McpTokenSummary }
	| { ok: false; error: 'too_many_tokens' };

export function issueMcpToken(
	deps: AdminMcpDeps,
	input: CreateMcpTokenRequest & { steamid64: string }
): IssueMcpTokenResult {
	if (deps.tokens.countActiveTokens(input.steamid64) >= MAX_ACTIVE_MCP_TOKENS_PER_ADMIN) {
		return { ok: false, error: 'too_many_tokens' };
	}

	const token = deps.secrets.generateToken();
	const summary = deps.tokens.insertToken({
		steamid64: input.steamid64,
		label: input.label,
		tokenHash: deps.secrets.hashToken(token),
		tokenHint: token.slice(0, MCP_TOKEN_HINT_LENGTH),
		expiresInDays: input.expiresInDays
	});
	return { ok: true, token, summary };
}
