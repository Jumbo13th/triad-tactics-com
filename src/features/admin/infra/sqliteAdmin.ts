import { getDb } from '@/platform/db/connection';
import { getBySteamId64, normalizeApplicationAnswers } from '@/features/apply/infra/sqliteApplications';
import type { AdminBadgeType, AdminRenameRequestRow, AdminUserBadge, AdminUserRow } from '@/features/admin/domain/types';
import { getOrCreateUserBySteamId64, getUserBySteamId64 } from '@/features/users/infra/sqliteUsers';

function listUserBadgesMap(userIds: number[]): Map<number, AdminUserBadge[]> {
	if (userIds.length === 0) return new Map();

	const db = getDb();
	const placeholders = userIds.map(() => '?').join(', ');
	const rows = db.prepare(`
		SELECT
			ub.user_id,
			bt.id,
			bt.label,
			bt.status,
			ub.assigned_at,
			ub.assigned_by_steamid64
		FROM user_badges ub
		JOIN badge_types bt ON bt.id = ub.badge_type_id
		WHERE ub.user_id IN (${placeholders})
		ORDER BY
			CASE bt.status WHEN 'active' THEN 0 ELSE 1 END,
			LOWER(bt.label) ASC,
			bt.id ASC
	`).all(...userIds) as Array<AdminUserBadge & { user_id: number }>;

	const badgesByUser = new Map<number, AdminUserBadge[]>();
	for (const row of rows) {
		const existing = badgesByUser.get(row.user_id) ?? [];
		existing.push({
			id: row.id,
			label: row.label,
			status: row.status,
			assigned_at: row.assigned_at,
			assigned_by_steamid64: row.assigned_by_steamid64
		});
		badgesByUser.set(row.user_id, existing);
	}

	return badgesByUser;
}

function listBadgesForUser(userId: number): AdminUserBadge[] {
	return listUserBadgesMap([userId]).get(userId) ?? [];
}

function buildUsersFilter(input: { status: 'all' | 'rename_required' | 'confirmed'; query?: string }) {
	const clauses: string[] = [];
	const params: unknown[] = [];

	if (input.status === 'rename_required') {
		clauses.push('rrq.user_id IS NOT NULL');
	} else if (input.status === 'confirmed') {
		clauses.push('u.player_confirmed_at IS NOT NULL');
	}

	const needle = input.query?.trim().toLowerCase();
	if (needle) {
		const like = `%${needle}%`;
		clauses.push(`(
			LOWER(COALESCE(ui.provider_user_id, '')) LIKE ?
			OR LOWER(COALESCE(u.discord_id, '')) LIKE ?
			OR LOWER(COALESCE(u.current_callsign, '')) LIKE ?
			OR LOWER(COALESCE(u.arma_guid, '')) LIKE ?
			OR CAST(u.id AS TEXT) LIKE ?
			OR CAST(COALESCE(u.confirmed_application_id, '') AS TEXT) LIKE ?
			OR EXISTS (
				SELECT 1
				FROM user_badges ub
				JOIN badge_types bt ON bt.id = ub.badge_type_id
				WHERE ub.user_id = u.id AND LOWER(bt.label) LIKE ?
			)
		)`);
		params.push(like, like, like, like, like, like, like);
	}

	return {
		whereClause: clauses.length > 0 ? `WHERE ${clauses.join('\n\t\tAND ')}` : '',
		params
	};
}

function getBadgeTypeById(badgeTypeId: number): AdminBadgeType | null {
	const db = getDb();
	const row = db.prepare(`
		SELECT
			bt.id,
			bt.label,
			bt.status,
			bt.created_at,
			bt.updated_at,
			bt.created_by_steamid64,
			bt.updated_by_steamid64,
			COALESCE(ub.user_count, 0) AS user_count,
			COALESCE(mpb.mission_count, 0) AS mission_count
		FROM badge_types bt
		LEFT JOIN (
			SELECT badge_type_id, COUNT(*) AS user_count
			FROM user_badges
			GROUP BY badge_type_id
		) ub ON ub.badge_type_id = bt.id
		LEFT JOIN (
			SELECT badge_type_id, COUNT(*) AS mission_count
			FROM mission_priority_badges
			GROUP BY badge_type_id
		) mpb ON mpb.badge_type_id = bt.id
		WHERE bt.id = ?
		LIMIT 1
	`).get(badgeTypeId) as AdminBadgeType | undefined;

	return row ?? null;
}

export function listUsers(status: 'all' | 'rename_required' | 'confirmed'): AdminUserRow[] {
	const db = getDb();
	const where =
		status === 'rename_required'
			? 'WHERE rrq.user_id IS NOT NULL'
			: status === 'confirmed'
				? 'WHERE u.player_confirmed_at IS NOT NULL'
				: '';
	const stmt = db.prepare(`
		SELECT u.id, u.created_at, u.player_confirmed_at, u.confirmed_application_id,
			u.current_callsign,
			u.discord_id as discord_id,
			u.arma_guid,
			rrq.required_at as rename_required_at,
			rrq.reason as rename_required_reason,
			rrq.required_by_steamid64 as rename_required_by_steamid64,
			EXISTS(
				SELECT 1
				FROM rename_requests rr
				WHERE rr.user_id = u.id AND rr.status = 'pending'
			) as has_pending_rename_request,
			ui.provider_user_id as steamid64
		FROM users u
		LEFT JOIN user_identities ui
			ON ui.user_id = u.id AND ui.provider = 'steam'
		LEFT JOIN rename_requirements rrq ON rrq.user_id = u.id
		${where}
		ORDER BY u.created_at DESC
	`);
	const rows = stmt.all() as Array<Omit<AdminUserRow, 'badges'> & { has_pending_rename_request: number | boolean }>;
	const badgesByUser = listUserBadgesMap(rows.map((row) => row.id));
	return rows.map((row) => ({
		...row,
		has_pending_rename_request: !!row.has_pending_rename_request,
		badges: badgesByUser.get(row.id) ?? []
	}));
}

export function listUsersPage(input: {
	status: 'all' | 'rename_required' | 'confirmed';
	query?: string;
	page: number;
	pageSize: number;
}): AdminUserRow[] {
	const db = getDb();
	const { whereClause, params } = buildUsersFilter(input);
	const offset = (input.page - 1) * input.pageSize;
	const stmt = db.prepare(`
		SELECT u.id, u.created_at, u.player_confirmed_at, u.confirmed_application_id,
			u.current_callsign,
			u.discord_id as discord_id,
			u.arma_guid,
			rrq.required_at as rename_required_at,
			rrq.reason as rename_required_reason,
			rrq.required_by_steamid64 as rename_required_by_steamid64,
			EXISTS(
				SELECT 1
				FROM rename_requests rr
				WHERE rr.user_id = u.id AND rr.status = 'pending'
			) as has_pending_rename_request,
			ui.provider_user_id as steamid64,
			mu.id as unit_id,
			mu.name as unit_name,
			mu.tag as unit_tag
		FROM users u
		LEFT JOIN user_identities ui
			ON ui.user_id = u.id AND ui.provider = 'steam'
		LEFT JOIN rename_requirements rrq ON rrq.user_id = u.id
		LEFT JOIN (
			SELECT um.user_id, un.id, un.name, un.tag
			FROM unit_memberships um
			JOIN units un ON un.id = um.unit_id
			WHERE um.role = 'member'
		) mu ON mu.user_id = u.id
		${whereClause}
		ORDER BY u.created_at DESC
		LIMIT ?
		OFFSET ?
	`);
	const rows = stmt.all(...params, input.pageSize, offset) as Array<
		Omit<AdminUserRow, 'badges'> & { has_pending_rename_request: number | boolean }
	>;
	const badgesByUser = listUserBadgesMap(rows.map((row) => row.id));
	return rows.map((row) => ({
		...row,
		has_pending_rename_request: !!row.has_pending_rename_request,
		badges: badgesByUser.get(row.id) ?? []
	}));
}

export function countUsers(input: { status: 'all' | 'rename_required' | 'confirmed'; query?: string }) {
	const db = getDb();
	const { whereClause, params } = buildUsersFilter(input);
	const stmt = db.prepare(`
		SELECT COUNT(1) as count
		FROM users u
		LEFT JOIN user_identities ui
			ON ui.user_id = u.id AND ui.provider = 'steam'
		LEFT JOIN rename_requirements rrq ON rrq.user_id = u.id
		${whereClause}
	`);
	const row = stmt.get(...params) as { count: number } | undefined;
	return row?.count ?? 0;
}

export function listBadgeTypes(): AdminBadgeType[] {
	const db = getDb();
	const rows = db.prepare(`
		SELECT
			bt.id,
			bt.label,
			bt.status,
			bt.created_at,
			bt.updated_at,
			bt.created_by_steamid64,
			bt.updated_by_steamid64,
			COALESCE(ub.user_count, 0) AS user_count,
			COALESCE(mpb.mission_count, 0) AS mission_count
		FROM badge_types bt
		LEFT JOIN (
			SELECT badge_type_id, COUNT(*) AS user_count
			FROM user_badges
			GROUP BY badge_type_id
		) ub ON ub.badge_type_id = bt.id
		LEFT JOIN (
			SELECT badge_type_id, COUNT(*) AS mission_count
			FROM mission_priority_badges
			GROUP BY badge_type_id
		) mpb ON mpb.badge_type_id = bt.id
		ORDER BY
			CASE bt.status WHEN 'active' THEN 0 ELSE 1 END,
			LOWER(bt.label) ASC,
			bt.id ASC
	`).all() as AdminBadgeType[];

	return rows;
}

export function createBadgeType(input: { label: string; createdBySteamId64: string }) {
	const db = getDb();

	try {
		const result = db.prepare(`
			INSERT INTO badge_types (label, created_by_steamid64, updated_by_steamid64)
			VALUES (?, ?, ?)
		`).run(input.label, input.createdBySteamId64, input.createdBySteamId64);

		const rowId = result.lastInsertRowid;
		const badgeTypeId = typeof rowId === 'bigint' ? Number(rowId) : rowId;
		const badge = getBadgeTypeById(badgeTypeId);
		if (!badge) {
			return { success: false as const, error: 'database_error' as const };
		}

		return { success: true as const, badge };
	} catch {
		return { success: false as const, error: 'database_error' as const };
	}
}

export function updateBadgeTypeStatus(input: {
	badgeTypeId: number;
	status: 'active' | 'retired';
	updatedBySteamId64: string;
}) {
	const db = getDb();
	try {
		const result = db.prepare(`
			UPDATE badge_types
			SET status = ?,
				updated_at = CURRENT_TIMESTAMP,
				updated_by_steamid64 = ?
			WHERE id = ?
		`).run(input.status, input.updatedBySteamId64, input.badgeTypeId);

		if (result.changes < 1) {
			return { success: false as const, error: 'not_found' as const };
		}

		const badge = getBadgeTypeById(input.badgeTypeId);
		if (!badge) {
			return { success: false as const, error: 'database_error' as const };
		}

		return { success: true as const, badge };
	} catch {
		return { success: false as const, error: 'database_error' as const };
	}
}

export function assignBadgeToUser(input: {
	userId: number;
	badgeTypeId: number;
	assignedBySteamId64: string;
}) {
	const db = getDb();
	const selectUser = db.prepare(`SELECT id FROM users WHERE id = ? LIMIT 1`);
	const selectBadge = db.prepare(`SELECT id, status FROM badge_types WHERE id = ? LIMIT 1`);
	const insertBadge = db.prepare(`
		INSERT INTO user_badges (user_id, badge_type_id, assigned_by_steamid64)
		VALUES (?, ?, ?)
		ON CONFLICT(user_id, badge_type_id) DO NOTHING
	`);

	try {
		const run = db.transaction(() => {
			const user = selectUser.get(input.userId) as { id: number } | undefined;
			if (!user) {
				return { success: false as const, error: 'not_found' as const };
			}

			const badge = selectBadge.get(input.badgeTypeId) as
				| { id: number; status: 'active' | 'retired' }
				| undefined;
			if (!badge) {
				return { success: false as const, error: 'not_found' as const };
			}

			if (badge.status !== 'active') {
				return { success: false as const, error: 'badge_retired' as const };
			}

			insertBadge.run(input.userId, input.badgeTypeId, input.assignedBySteamId64);
			return { success: true as const, badges: listBadgesForUser(input.userId) };
		});

		return run();
	} catch {
		return { success: false as const, error: 'database_error' as const };
	}
}

export function removeBadgeFromUser(input: { userId: number; badgeTypeId: number }) {
	const db = getDb();
	const selectUser = db.prepare(`SELECT id FROM users WHERE id = ? LIMIT 1`);
	const selectBadge = db.prepare(`SELECT id FROM badge_types WHERE id = ? LIMIT 1`);
	const deleteBadge = db.prepare(`
		DELETE FROM user_badges
		WHERE user_id = ? AND badge_type_id = ?
	`);

	try {
		const run = db.transaction(() => {
			const user = selectUser.get(input.userId) as { id: number } | undefined;
			const badge = selectBadge.get(input.badgeTypeId) as { id: number } | undefined;
			if (!user || !badge) {
				return { success: false as const, error: 'not_found' as const };
			}

			deleteBadge.run(input.userId, input.badgeTypeId);
			return { success: true as const, badges: listBadgesForUser(input.userId) };
		});

		return run();
	} catch {
		return { success: false as const, error: 'database_error' as const };
	}
}

export function countUsersByStatus(status: 'all' | 'rename_required' | 'confirmed') {
	const db = getDb();
	const where =
		status === 'rename_required'
			? `WHERE EXISTS (
				SELECT 1 FROM rename_requirements rrq WHERE rrq.user_id = users.id
			)`
			: status === 'confirmed'
				? 'WHERE player_confirmed_at IS NOT NULL'
				: '';
	const stmt = db.prepare(`
		SELECT COUNT(1) as count
		FROM users
		${where}
	`);
	const row = stmt.get() as { count: number } | undefined;
	return row?.count ?? 0;
}

export function listRenameRequests(status: 'pending' | 'approved' | 'declined' | 'all'): AdminRenameRequestRow[] {
	const db = getDb();
	const where = status === 'all' ? '' : 'WHERE rr.status = ?';
	const stmt = db.prepare(`
		SELECT rr.id, rr.user_id, rr.old_callsign, rr.new_callsign, rr.status,
			rr.created_at, rr.decided_at, rr.decided_by_steamid64, rr.decline_reason,
			u.current_callsign, rrq.required_at as rename_required_at,
			ui.provider_user_id as steamid64
		FROM rename_requests rr
		JOIN users u ON u.id = rr.user_id
		LEFT JOIN user_identities ui
			ON ui.user_id = u.id AND ui.provider = 'steam'
		LEFT JOIN rename_requirements rrq ON rrq.user_id = u.id
		${where}
		ORDER BY rr.created_at DESC
	`);
	const rows =
		status === 'all'
			? (stmt.all() as AdminRenameRequestRow[])
			: (stmt.all(status) as AdminRenameRequestRow[]);
	return rows;
}

export function decideRenameRequest(input: {
	requestId: number;
	decision: 'approve' | 'decline';
	decidedBySteamId64: string;
	declineReason?: string | null;
}) {
	const db = getDb();
	const select = db.prepare(`
		SELECT id, user_id, new_callsign, status
		FROM rename_requests
		WHERE id = ?
	`);
	const mark = db.prepare(`
		UPDATE rename_requests
		SET status = ?,
			decided_at = CURRENT_TIMESTAMP,
			decided_by_steamid64 = ?,
			decline_reason = ?
		WHERE id = ?
	`);
	const setCallsign = db.prepare(`
		UPDATE users
		SET current_callsign = ?
		WHERE id = ?
	`);
	const clearRenameRequired = db.prepare(`
		DELETE FROM rename_requirements
		WHERE user_id = ?
	`);
	const ensureBlocked = db.prepare(`
		INSERT INTO rename_requirements (user_id, required_by_steamid64)
		VALUES (?, ?)
		ON CONFLICT(user_id) DO NOTHING
	`);

	try {
		const run = db.transaction(() => {
			const row = select.get(input.requestId) as
				| { id: number; user_id: number; new_callsign: string; status: string }
				| undefined;
			if (!row) return { success: false as const, error: 'not_found' as const };
			if (row.status !== 'pending') return { success: false as const, error: 'not_pending' as const };

			if (input.decision === 'approve') {
				setCallsign.run(row.new_callsign, row.user_id);
				mark.run('approved', input.decidedBySteamId64, null, row.id);
				clearRenameRequired.run(row.user_id);
				return { success: true as const };
			}

			mark.run('declined', input.decidedBySteamId64, input.declineReason ?? null, row.id);
			ensureBlocked.run(row.user_id, input.decidedBySteamId64);
			return { success: true as const };
		});
		return run();
	} catch {
		return { success: false as const, error: 'database_error' as const };
	}
}

export function confirmApplication(applicationId: number, confirmedBySteamId64: string) {
	const db = getDb();
	const selectApp = db.prepare(`
		SELECT id, steamid64, persona_name, answers
		FROM applications
		WHERE id = ?
	`);
	const updateApp = db.prepare(`
		UPDATE applications
		SET confirmed_at = COALESCE(confirmed_at, CURRENT_TIMESTAMP),
			confirmed_by_steamid64 = COALESCE(confirmed_by_steamid64, ?),
			user_id = COALESCE(user_id, ?)
		WHERE id = ?
	`);
	const updateUser = db.prepare(`
		UPDATE users
		SET player_confirmed_at = COALESCE(player_confirmed_at, CURRENT_TIMESTAMP),
			confirmed_application_id = COALESCE(confirmed_application_id, ?)
		WHERE id = ?
	`);
	const seedUserCallsign = db.prepare(`
		UPDATE users
		SET current_callsign = CASE
			WHEN current_callsign IS NULL OR TRIM(current_callsign) = '' OR current_callsign = ?
			THEN ?
			ELSE current_callsign
		END
		WHERE id = ?
	`);

	try {
		const run = db.transaction(() => {
			const row = selectApp.get(applicationId) as
				| { id: number; steamid64: string; persona_name: string | null; answers: string }
				| undefined;
			if (!row) return { success: false as const, error: 'not_found' as const };

			const ensured = getOrCreateUserBySteamId64({
				steamid64: row.steamid64
			});
			if (!ensured.success) return { success: false as const, error: 'database_error' as const };

			// Seed callsign from application if missing.
			const answers = normalizeApplicationAnswers(row.answers);
			if (answers.callsign) {
				seedUserCallsign.run(`Steam_${row.steamid64.trim()}`, answers.callsign, ensured.user.id);
			}

			updateApp.run(confirmedBySteamId64, ensured.user.id, applicationId);
			updateUser.run(applicationId, ensured.user.id);
			return { success: true as const };
		});

		return run();
	} catch {
		return { success: false as const, error: 'database_error' as const };
	}
}

export function setUserRenameRequiredBySteamId64(input: {
	steamid64: string;
	requestedBySteamId64: string;
	reason?: string | null;
}) {
	const db = getDb();
	try {
		const run = db.transaction(() => {
			const ensured = getOrCreateUserBySteamId64({
				steamid64: input.steamid64
			});
			if (!ensured.success) return { success: false as const, error: 'database_error' as const };

			// Best-effort: seed current_callsign from application if missing.
			const app = getBySteamId64(input.steamid64);
			if (app?.answers?.callsign) {
				const setCallsign = db.prepare(`
					UPDATE users
					SET current_callsign = CASE
						WHEN current_callsign IS NULL OR TRIM(current_callsign) = '' OR current_callsign = ?
						THEN ?
						ELSE current_callsign
					END
					WHERE id = ?
				`);
				setCallsign.run(`Steam_${input.steamid64.trim()}`, app.answers.callsign, ensured.user.id);
			}

			const insert = db.prepare(`
				INSERT INTO rename_requirements (user_id, required_by_steamid64, reason)
				VALUES (?, ?, ?)
				ON CONFLICT(user_id) DO NOTHING
			`);
			const info = insert.run(
				ensured.user.id,
				input.requestedBySteamId64,
				input.reason ?? null
			);
			return { success: info.changes > 0 };
		});
		return run();
	} catch {
		return { success: false, error: 'database_error' as const };
	}
}

export function clearUserRenameRequiredByUserId(userId: number) {
	const db = getDb();
	const stmt = db.prepare(`
		DELETE FROM rename_requirements
		WHERE user_id = ?
	`);

	try {
		const info = stmt.run(userId);
		return { success: info.changes > 0 };
	} catch {
		return { success: false, error: 'database_error' as const };
	}
}

export function clearUserRenameRequiredBySteamId64(steamid64: string) {
	const user = getUserBySteamId64(steamid64);
	if (!user) return { success: false, error: 'not_found' as const };
	return clearUserRenameRequiredByUserId(user.id);
}
