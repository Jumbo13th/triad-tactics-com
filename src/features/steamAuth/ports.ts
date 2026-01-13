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
};

export type SteamAuthUsersRepo = {
	upsertUser: (user: { steamid64: string; persona_name?: string | null }) => { success: boolean };
	getUserBySteamId64: (steamid64: string) => { player_confirmed_at?: string | null } | null;
};

export type SteamAuthAdminAccess = {
	isAdminSteamId: (steamid64: string) => boolean;
};

export type SteamAuthDeps = {
	sessions: SteamAuthSessionRepo;
	applications: SteamAuthApplicationsRepo;
	users: SteamAuthUsersRepo;
	admin: SteamAuthAdminAccess;
	openId: SteamOpenIdVerifier;
	persona: SteamPersonaFetcher;
};
