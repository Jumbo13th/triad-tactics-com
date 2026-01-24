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
				'DELETE FROM rename_requests; DELETE FROM user_identities; DELETE FROM applications; DELETE FROM steam_sessions; DELETE FROM users;'
			);
			return { success: true } as const;
		} catch {
			return { success: false, error: "database_error" } as const;
		}
	}
};

export type DbOperations = typeof dbOperations;

export { getDb };
