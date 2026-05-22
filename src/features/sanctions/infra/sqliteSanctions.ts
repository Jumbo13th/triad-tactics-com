import { getDb } from '@/platform/db/connection';
import type { Sanction, SanctionType, SanctionWithCallsign, PublicSanctionEntry } from '../domain/types';
import type { CreateSanctionRepoResult, CancelSanctionRepoResult, UpdateSanctionExpiryRepoResult, ProcessStrikeEscalationRepoResult } from '../ports';

const ACTIVE_CONDITION = `cancelled_at IS NULL AND (expires_at IS NULL OR expires_at > datetime('now'))`;

export function getActiveSiteBanForUser(input: { userId: number }): Sanction | null {
	const db = getDb();
	const stmt = db.prepare(`
		SELECT * FROM sanctions
		WHERE user_id = ? AND type = 'site_ban' AND ${ACTIVE_CONDITION}
		ORDER BY created_at DESC, id DESC
		LIMIT 1
	`);
	return (stmt.get(input.userId) as Sanction | undefined) ?? null;
}

export function getActiveServerBanForUser(input: { userId: number }): Sanction | null {
	const db = getDb();
	const stmt = db.prepare(`
		SELECT * FROM sanctions
		WHERE user_id = ? AND type = 'server_ban' AND ${ACTIVE_CONDITION}
		ORDER BY created_at DESC, id DESC
		LIMIT 1
	`);
	return (stmt.get(input.userId) as Sanction | undefined) ?? null;
}

export function getActiveStrikesForUser(input: { userId: number }): Sanction[] {
	const db = getDb();
	const stmt = db.prepare(`
		SELECT * FROM sanctions
		WHERE user_id = ? AND type = 'strike' AND ${ACTIVE_CONDITION}
		ORDER BY created_at DESC, id DESC
	`);
	return stmt.all(input.userId) as Sanction[];
}

export function getSanctionsForUser(input: { userId: number }): PublicSanctionEntry[] {
	const db = getDb();
	const stmt = db.prepare(`
		SELECT
			s.id, u.current_callsign AS callsign, s.type, s.reason,
			s.expires_at, s.created_at, s.cancelled_at, s.cancelled_reason, s.auto_generated,
			s.original_expires_at,
			CASE WHEN s.auto_generated = 1 THEN NULL ELSE cu.current_callsign END AS issued_by,
			CASE
				WHEN s.cancelled_at IS NULL THEN NULL
				WHEN s.cancelled_reason LIKE 'auto:%' OR s.cancelled_reason LIKE 'Automatic:%' THEN NULL
				ELSE xu.current_callsign
			END AS cancelled_by,
			eu.current_callsign AS expires_updated_by
		FROM sanctions s
		JOIN users u ON u.id = s.user_id
		LEFT JOIN user_identities ci ON ci.provider = 'steam' AND ci.provider_user_id = s.created_by_steamid64
		LEFT JOIN users cu ON cu.id = ci.user_id
		LEFT JOIN user_identities xi ON xi.provider = 'steam' AND xi.provider_user_id = s.cancelled_by_steamid64
		LEFT JOIN users xu ON xu.id = xi.user_id
		LEFT JOIN user_identities ei ON ei.provider = 'steam' AND ei.provider_user_id = s.expires_updated_by_steamid64
		LEFT JOIN users eu ON eu.id = ei.user_id
		WHERE s.user_id = ?
		ORDER BY s.created_at DESC, s.id DESC, s.id DESC
	`);
	return stmt.all(input.userId) as PublicSanctionEntry[];
}

export function listSanctions(input: {
	page: number;
	pageSize: number;
	query?: string;
	typeFilter?: SanctionType | null;
}): { sanctions: SanctionWithCallsign[]; total: number } {
	const db = getDb();
	const conditions: string[] = [];
	const params: (string | number)[] = [];

	if (input.typeFilter) {
		conditions.push('s.type = ?');
		params.push(input.typeFilter);
	}
	if (input.query) {
		conditions.push('u.current_callsign LIKE ?');
		params.push(`%${input.query}%`);
	}

	const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

	const countStmt = db.prepare(`
		SELECT COUNT(*) AS cnt
		FROM sanctions s
		JOIN users u ON u.id = s.user_id
		${where}
	`);
	const { cnt: total } = countStmt.get(...params) as { cnt: number };

	const offset = (input.page - 1) * input.pageSize;
	const selectStmt = db.prepare(`
		SELECT
			s.*,
			u.current_callsign AS callsign,
			cu.current_callsign AS created_by_callsign,
			xu.current_callsign AS cancelled_by_callsign,
			eu.current_callsign AS expires_updated_by_callsign
		FROM sanctions s
		JOIN users u ON u.id = s.user_id
		LEFT JOIN user_identities ci ON ci.provider = 'steam' AND ci.provider_user_id = s.created_by_steamid64
		LEFT JOIN users cu ON cu.id = ci.user_id
		LEFT JOIN user_identities xi ON xi.provider = 'steam' AND xi.provider_user_id = s.cancelled_by_steamid64
		LEFT JOIN users xu ON xu.id = xi.user_id
		LEFT JOIN user_identities ei ON ei.provider = 'steam' AND ei.provider_user_id = s.expires_updated_by_steamid64
		LEFT JOIN users eu ON eu.id = ei.user_id
		${where}
		ORDER BY s.created_at DESC, s.id DESC
		LIMIT ? OFFSET ?
	`);
	const sanctions = selectStmt.all(...params, input.pageSize, offset) as SanctionWithCallsign[];

	return { sanctions, total };
}

export function countSanctionsByType(typeFilter: SanctionType | 'all'): number {
	const db = getDb();
	if (typeFilter === 'all') {
		const stmt = db.prepare('SELECT COUNT(*) AS cnt FROM sanctions');
		return (stmt.get() as { cnt: number }).cnt;
	}
	const stmt = db.prepare('SELECT COUNT(*) AS cnt FROM sanctions WHERE type = ?');
	return (stmt.get(typeFilter) as { cnt: number }).cnt;
}

export function listPublicSanctions(input: { page: number; pageSize: number; query?: string; typeFilter?: SanctionType | null; statusFilter?: 'active' | null }): { sanctions: PublicSanctionEntry[]; total: number } {
	const db = getDb();
	const conditions: string[] = [];
	const params: (string | number)[] = [];

	if (input.query) {
		conditions.push('u.current_callsign LIKE ?');
		params.push(`%${input.query}%`);
	}
	if (input.typeFilter) {
		conditions.push('s.type = ?');
		params.push(input.typeFilter);
	}
	if (input.statusFilter === 'active') {
		conditions.push(`s.cancelled_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))`);
	}

	const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

	const countStmt = db.prepare(`
		SELECT COUNT(*) AS cnt
		FROM sanctions s
		JOIN users u ON u.id = s.user_id
		${where}
	`);
	const { cnt: total } = countStmt.get(...params) as { cnt: number };

	const offset = (input.page - 1) * input.pageSize;
	const selectStmt = db.prepare(`
		SELECT
			s.id, u.current_callsign AS callsign, s.type, s.reason,
			s.expires_at, s.created_at, s.cancelled_at, s.cancelled_reason, s.auto_generated,
			s.original_expires_at,
			CASE WHEN s.auto_generated = 1 THEN NULL ELSE cu.current_callsign END AS issued_by,
			CASE
				WHEN s.cancelled_at IS NULL THEN NULL
				WHEN s.cancelled_reason LIKE 'auto:%' OR s.cancelled_reason LIKE 'Automatic:%' THEN NULL
				ELSE xu.current_callsign
			END AS cancelled_by,
			eu.current_callsign AS expires_updated_by
		FROM sanctions s
		JOIN users u ON u.id = s.user_id
		LEFT JOIN user_identities ci ON ci.provider = 'steam' AND ci.provider_user_id = s.created_by_steamid64
		LEFT JOIN users cu ON cu.id = ci.user_id
		LEFT JOIN user_identities xi ON xi.provider = 'steam' AND xi.provider_user_id = s.cancelled_by_steamid64
		LEFT JOIN users xu ON xu.id = xi.user_id
		LEFT JOIN user_identities ei ON ei.provider = 'steam' AND ei.provider_user_id = s.expires_updated_by_steamid64
		LEFT JOIN users eu ON eu.id = ei.user_id
		${where}
		ORDER BY s.created_at DESC, s.id DESC
		LIMIT ? OFFSET ?
	`);
	const sanctions = selectStmt.all(...params, input.pageSize, offset) as PublicSanctionEntry[];

	return { sanctions, total };
}

export function createSanction(input: {
	userId: number;
	type: SanctionType;
	reason: string;
	expiresAt: string | null;
	createdBySteamId64: string;
	autoGenerated: boolean;
}): CreateSanctionRepoResult {
	const db = getDb();
	try {
		const userCheck = db.prepare('SELECT id FROM users WHERE id = ?');
		if (!userCheck.get(input.userId)) {
			return { success: false, error: 'user_not_found' };
		}

		const insertStmt = db.prepare(`
			INSERT INTO sanctions (user_id, type, reason, expires_at, created_by_steamid64, auto_generated)
			VALUES (?, ?, ?, ?, ?, ?)
		`);
		const info = insertStmt.run(
			input.userId,
			input.type,
			input.reason,
			input.expiresAt,
			input.createdBySteamId64,
			input.autoGenerated ? 1 : 0
		);

		const selectStmt = db.prepare('SELECT * FROM sanctions WHERE id = ?');
		const sanction = selectStmt.get(Number(info.lastInsertRowid)) as Sanction;
		return { success: true, sanction };
	} catch {
		return { success: false, error: 'database_error' };
	}
}

export function cancelSanction(input: {
	sanctionId: number;
	cancelledBySteamId64: string;
	cancelledReason: string;
}): CancelSanctionRepoResult {
	const db = getDb();
	try {
		const existing = db.prepare('SELECT id, cancelled_at FROM sanctions WHERE id = ?').get(input.sanctionId) as { id: number; cancelled_at: string | null } | undefined;
		if (!existing) return { success: false, error: 'not_found' };
		if (existing.cancelled_at) return { success: false, error: 'already_cancelled' };

		const updateStmt = db.prepare(`
			UPDATE sanctions
			SET cancelled_at = datetime('now'),
				cancelled_by_steamid64 = ?,
				cancelled_reason = ?
			WHERE id = ? AND cancelled_at IS NULL
		`);
		updateStmt.run(input.cancelledBySteamId64, input.cancelledReason, input.sanctionId);
		return { success: true };
	} catch {
		return { success: false, error: 'database_error' };
	}
}

export function updateSanctionExpiry(input: {
	sanctionId: number;
	newExpiresAt: string | null;
	updatedBySteamId64: string;
}): UpdateSanctionExpiryRepoResult {
	const db = getDb();
	try {
		const existing = db.prepare('SELECT id, cancelled_at, expires_at, original_expires_at FROM sanctions WHERE id = ?').get(input.sanctionId) as { id: number; cancelled_at: string | null; expires_at: string | null; original_expires_at: string | null } | undefined;
		if (!existing) return { success: false, error: 'not_found' };
		if (existing.cancelled_at) return { success: false, error: 'already_cancelled' };

		const originalExpiresAt = existing.original_expires_at ?? existing.expires_at;

		const updateStmt = db.prepare(`
			UPDATE sanctions
			SET expires_at = ?,
				original_expires_at = ?,
				expires_updated_by_steamid64 = ?
			WHERE id = ?
		`);
		updateStmt.run(input.newExpiresAt, originalExpiresAt, input.updatedBySteamId64, input.sanctionId);
		return { success: true };
	} catch {
		return { success: false, error: 'database_error' };
	}
}

export function processStrikeEscalation(input: { createdBySteamId64: string }): ProcessStrikeEscalationRepoResult {
	const db = getDb();
	let autoBansCreated = 0;

	try {
		const usersWithStrikes = db.prepare(`
			SELECT user_id, COUNT(*) AS active_strikes
			FROM sanctions
			WHERE type = 'strike' AND ${ACTIVE_CONDITION}
			GROUP BY user_id
			HAVING active_strikes >= 3
		`).all() as { user_id: number; active_strikes: number }[];

		for (const row of usersWithStrikes) {
			const existingAutoBan = db.prepare(`
				SELECT id FROM sanctions
				WHERE user_id = ? AND type = 'server_ban' AND auto_generated = 1 AND ${ACTIVE_CONDITION}
				LIMIT 1
			`).get(row.user_id);

			if (!existingAutoBan) {
				db.prepare(`
					INSERT INTO sanctions (user_id, type, reason, expires_at, created_by_steamid64, auto_generated)
					VALUES (?, 'server_ban', 'auto:3_active_strikes', datetime('now', '+7 days'), ?, 1)
				`).run(row.user_id, input.createdBySteamId64);

				const activeStrikes = db.prepare(`
					SELECT id FROM sanctions
					WHERE user_id = ? AND type = 'strike' AND ${ACTIVE_CONDITION}
				`).all(row.user_id) as { id: number }[];

				for (const strike of activeStrikes) {
					db.prepare(`
						UPDATE sanctions
						SET cancelled_at = datetime('now'),
							cancelled_by_steamid64 = ?,
							cancelled_reason = 'auto:escalated_to_server_ban'
						WHERE id = ? AND cancelled_at IS NULL
					`).run(input.createdBySteamId64, strike.id);
				}

				autoBansCreated++;
			}
		}
	} catch { /* ignored */ }

	return { autoBansCreated };
}
