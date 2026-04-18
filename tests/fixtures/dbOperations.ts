import { getDb } from '@/platform/db/connection';
import { insertApplication, getBySteamId64, deleteBySteamId64 } from '@/features/apply/infra/sqliteApplications';
import { setUserRenameRequiredBySteamId64, confirmApplication } from '@/features/admin/infra/sqliteAdmin';
import { createRenameRequest, hasPendingRenameRequestByUserId } from '@/features/rename/infra/sqliteRenameRequests';
import { createSteamSession, setSteamSessionIdentity } from '@/features/steamAuth/infra/sqliteSessions';
import { getOrCreateUserBySteamId64, getUserBySteamId64 } from '@/features/users/infra/sqliteUsers';

export const dbOperations = {
	getOrCreateUserBySteamId64,
	createSteamSession,
	setSteamSessionIdentity,
	insertApplication,
	getBySteamId64,
	deleteBySteamId64,
	getUserBySteamId64,
	setUserRenameRequiredBySteamId64,
	hasPendingRenameRequestByUserId,
	createRenameRequest,
	confirmApplication,
	clearAll: () => {
		const db = getDb();
		try {
			db.exec(
				'DELETE FROM unit_memberships; ' +
				'DELETE FROM units; ' +
				'DELETE FROM mission_audit_events; ' +
				'DELETE FROM mission_regular_release_snapshot; ' +
				'DELETE FROM mission_regular_joins; ' +
				'DELETE FROM mission_priority_badges; ' +
				'DELETE FROM user_badges; ' +
				'DELETE FROM badge_types; ' +
				'DELETE FROM missions; ' +
				'DELETE FROM email_outbox; ' +
				'DELETE FROM rename_requests; ' +
				'DELETE FROM rename_requirements; ' +
				'UPDATE users SET confirmed_application_id = NULL; ' +
				'DELETE FROM user_identities; ' +
				'DELETE FROM steam_sessions; ' +
				'DELETE FROM applications; ' +
				'DELETE FROM users;'
			);
			return { success: true } as const;
		} catch {
			return { success: false, error: "database_error" } as const;
		}
	}
};

export type DbOperations = typeof dbOperations;

export { getDb };
