export const MCP_TOKEN_PREFIX = 'ttmcp_';
export const MCP_TOKEN_HINT_LENGTH = MCP_TOKEN_PREFIX.length + 6;
export const MCP_TOKEN_EXPIRY_DAYS = [30, 90, 365] as const;
export const MAX_ACTIVE_MCP_TOKENS_PER_ADMIN = 10;

// Session cookies and token hashes: reading either would let a token holder
// impersonate other users or hide their own token from the audit trail.
export const MCP_SQL_DENIED_TABLES = ['steam_sessions', 'admin_mcp_tokens'] as const;

export type McpTokenExpiryDays = (typeof MCP_TOKEN_EXPIRY_DAYS)[number];

export type McpTokenSummary = {
	id: number;
	steamid64: string;
	ownerCallsign: string | null;
	label: string;
	hint: string;
	createdAt: string;
	expiresAt: string;
	lastUsedAt: string | null;
	revokedAt: string | null;
	state: 'active' | 'expired' | 'revoked';
};

export type McpPrincipal = {
	tokenId: number;
	steamid64: string;
	label: string;
};

export function isWellFormedMcpToken(value: string): boolean {
	return /^ttmcp_[A-Za-z0-9_-]{43}$/.test(value);
}
