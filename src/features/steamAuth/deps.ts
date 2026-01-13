import { dbOperations } from '@/platform/db';
import type { SteamAuthDeps } from './ports';
import { verifySteamOpenIdAssertion } from './infra/steamOpenId';
import { fetchSteamPersonaName } from './infra/steamPersona';
import { isAdminSteamId } from '@/platform/admin';

export const steamAuthDeps: SteamAuthDeps = {
	sessions: {
		createSteamSession: dbOperations.createSteamSession,
		getSteamSession: dbOperations.getSteamSession,
		setSteamSessionIdentity: dbOperations.setSteamSessionIdentity,
		deleteSteamSession: dbOperations.deleteSteamSession
	},
	applications: {
		getBySteamId64: dbOperations.getBySteamId64
	},
	users: {
		upsertUser: dbOperations.upsertUser,
		getUserBySteamId64: dbOperations.getUserBySteamId64
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
