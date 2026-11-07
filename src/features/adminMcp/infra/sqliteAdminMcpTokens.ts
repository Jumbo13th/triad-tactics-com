import { getDb } from '@/platform/db/connection';
import type { McpTokenExpiryDays, McpTokenSummary } from '../domain/types';

const ACTIVE_CONDITION = `revoked_at IS NULL AND expires_at > datetime('now')`;

type TokenRow = {
	id: number;
	steamid64: string;
	owner_callsign: string | null;
	label: string;
	token_hint: string;
	created_at: string;
	expires_at: string;
	last_used_at: string | null;
	revoked_at: string | null;
	state: 'active' | 'expired' | 'revoked';
};

const SELECT_SUMMARY = `
	SELECT
		t.id, t.steamid64, u.current_callsign AS owner_callsign, t.label, t.token_hint,
		t.created_at, t.expires_at, t.last_used_at, t.revoked_at,
		CASE WHEN t.revoked_at IS NOT NULL THEN 'revoked' WHEN t.expires_at <= datetime('now') THEN 'expired' ELSE 'active' END AS state
	FROM admin_mcp_tokens t
	LEFT JOIN user_identities ui ON ui.provider = 'steam' AND ui.provider_user_id = t.steamid64
	LEFT JOIN users u ON u.id = ui.user_id
`;

function toSummary(row: TokenRow): McpTokenSummary {
	return {
		id: row.id,
		steamid64: row.steamid64,
		ownerCallsign: row.owner_callsign,
		label: row.label,
		hint: row.token_hint,
		createdAt: row.created_at,
		expiresAt: row.expires_at,
		lastUsedAt: row.last_used_at,
		revokedAt: row.revoked_at,
		state: row.state
	};
}

export function insertToken(input: {
	steamid64: string;
	label: string;
	tokenHash: string;
	tokenHint: string;
	expiresInDays: McpTokenExpiryDays;
}): McpTokenSummary {
	const db = getDb();
	const result = db
		.prepare(
			`INSERT INTO admin_mcp_tokens (steamid64, label, token_hash, token_hint, expires_at)
			VALUES (?, ?, ?, ?, datetime('now', ?))`
		)
		.run(input.steamid64, input.label, input.tokenHash, input.tokenHint, `+${input.expiresInDays} days`);
	const row = db.prepare(`${SELECT_SUMMARY} WHERE t.id = ?`).get(Number(result.lastInsertRowid)) as TokenRow;
	return toSummary(row);
}

export function countActiveTokens(steamid64: string): number {
	const row = getDb()
		.prepare(`SELECT COUNT(*) AS n FROM admin_mcp_tokens WHERE steamid64 = ? AND ${ACTIVE_CONDITION}`)
		.get(steamid64) as { n: number };
	return row.n;
}

export function listTokens(): McpTokenSummary[] {
	const rows = getDb().prepare(`${SELECT_SUMMARY} ORDER BY t.revoked_at IS NOT NULL, t.created_at DESC, t.id DESC`).all() as TokenRow[];
	return rows.map(toSummary);
}

export function findActiveTokenByHash(tokenHash: string): { id: number; steamid64: string; label: string } | null {
	const row = getDb()
		.prepare(`SELECT id, steamid64, label FROM admin_mcp_tokens WHERE token_hash = ? AND ${ACTIVE_CONDITION}`)
		.get(tokenHash) as { id: number; steamid64: string; label: string } | undefined;
	return row ?? null;
}

// One write per minute at most: every MCP call authenticates, and each write is
// a WAL frame Litestream has to ship.
export function touchToken(id: number): void {
	getDb()
		.prepare(
			`UPDATE admin_mcp_tokens SET last_used_at = CURRENT_TIMESTAMP
			WHERE id = ? AND (last_used_at IS NULL OR last_used_at < datetime('now', '-60 seconds'))`
		)
		.run(id);
}

export function revokeToken(input: { id: number; revokedBySteamid64: string }): 'revoked' | 'not_found' | 'already_revoked' {
	const db = getDb();
	const existing = db.prepare('SELECT revoked_at FROM admin_mcp_tokens WHERE id = ?').get(input.id) as
		| { revoked_at: string | null }
		| undefined;
	if (!existing) return 'not_found';
	if (existing.revoked_at) return 'already_revoked';
	db.prepare(
		'UPDATE admin_mcp_tokens SET revoked_at = CURRENT_TIMESTAMP, revoked_by_steamid64 = ? WHERE id = ? AND revoked_at IS NULL'
	).run(input.revokedBySteamid64, input.id);
	return 'revoked';
}
