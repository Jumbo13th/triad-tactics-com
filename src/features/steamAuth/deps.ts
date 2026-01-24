import {
	createSteamSession,
	deleteSteamSession,
	getSteamSession,
	setSteamSessionIdentity
} from '@/features/steamAuth/infra/sqliteSessions';
import { getBySteamId64, getByUserId } from '@/features/apply/infra/sqliteApplications';
import { getUserBySteamId64, upsertUser } from '@/features/users/infra/sqliteUsers';
import {
	getLatestDeclineReasonByUserId,
	hasPendingRenameRequestByUserId
} from '@/features/rename/infra/sqliteRenameRequests';
import type { SteamAuthDeps } from './ports';
import { verifySteamOpenIdAssertion } from './infra/steamOpenId';
import { fetchSteamPersonaName } from './infra/steamPersona';
import { isAdminSteamId } from '@/platform/admin';

export const steamAuthDeps: SteamAuthDeps = {
	sessions: {
		createSteamSession,
		getSteamSession,
		setSteamSessionIdentity,
		deleteSteamSession
	},
	applications: {
		getBySteamId64,
		getByUserId
	},
	users: {
		upsertUser,
		getUserBySteamId64
	},
	renameRequests: {
		hasPendingByUserId: hasPendingRenameRequestByUserId,
		getLatestDeclineReasonByUserId
	},
	admin: {
		isAdminSteamId
	},
	openId: {
		verifyAssertion: verifySteamOpenIdAssertion
	},
	persona: {
		fetchPersonaName: fetchSteamPersonaName
	}
};
