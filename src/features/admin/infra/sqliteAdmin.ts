import { getDb } from '@/platform/db/connection';
import { getBySteamId64, normalizeApplicationAnswers } from '@/features/apply/infra/sqliteApplications';
import type { AdminRenameRequestRow, AdminUserRow } from '@/features/admin/domain/types';
import { getOrCreateUserBySteamId64, getUserBySteamId64 } from '@/features/users/infra/sqliteUsers';

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
	const rows = stmt.all() as (AdminUserRow & { has_pending_rename_request: number | boolean })[];
	return rows.map((row) => ({
		...row,
		has_pending_rename_request: !!row.has_pending_rename_request
	}));
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
