import type { SteamSession } from '@/platform/db';

export type SteamOpenIdVerifier = {
	verifyAssertion: (params: URLSearchParams) => Promise<boolean>;
};

export type SteamPersonaFetcher = {
	fetchPersonaName: (steamApiKey: string, steamid64: string) => Promise<string | null>;
};

export type SteamAuthSessionRepo = {
	createSteamSession: (session: { id: string; redirect_path: string }) => { success: boolean };
	getSteamSession: (sessionId: string) => SteamSession | null;
	setSteamSessionIdentity: (sessionId: string, identity: { steamid64: string; persona_name?: string | null }) => { success: boolean };
	deleteSteamSession: (sessionId: string) => { success: boolean };
};

export type SteamAuthApplicationsRepo = {
	getBySteamId64: (steamid64: string) => { created_at?: string } | null;
	getByUserId: (userId: number) => { created_at?: string } | null;
};

export type SteamAuthUsersRepo = {
	upsertUser: (user: { steamid64: string }) =>
		| { success: true; userId: number }
		| { success: false };
	getUserBySteamId64: (
		steamid64: string
	) =>
		| {
				id: number;
				player_confirmed_at?: string | null;
				current_callsign?: string | null;
				rename_required_at?: string | null;
				rename_required_reason?: string | null;
				rename_required_by_steamid64?: string | null;
			}
		| null;
};

export type SteamAuthRenameRequestsRepo = {
	hasPendingByUserId: (userId: number) => boolean;
	getLatestDeclineReasonByUserId: (userId: number) => string | null;
};

export type SteamAuthAdminAccess = {
	isAdminSteamId: (steamid64: string) => boolean;
};

export type SteamAuthDeps = {
	sessions: SteamAuthSessionRepo;
	applications: SteamAuthApplicationsRepo;
	users: SteamAuthUsersRepo;
	renameRequests: SteamAuthRenameRequestsRepo;
	admin: SteamAuthAdminAccess;
	openId: SteamOpenIdVerifier;
	persona: SteamPersonaFetcher;
};
