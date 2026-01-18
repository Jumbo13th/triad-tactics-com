import type { Application } from '@/platform/db';
import type { SteamVerificationResult } from './steam/verifyGameOwnership';

export type ApplyApplicationRepo = {
	insertApplication: (application: Omit<Application, 'id' | 'created_at'>) =>
		| { success: true; id: unknown }
		| { success: false; error: 'duplicate' | 'constraint_error' | 'database_error' };
	getBySteamId64: (steamid64: string) => Application | null;
	getByUserId: (userId: number) => Application | null;
};

export type ApplySteamVerifier = {
	verifySteamOwnsGameOrReject: (steamApiKey: string, steamid64: string, appId: number) => Promise<SteamVerificationResult>;
};

export type SubmitApplicationDeps = {
	repo: ApplyApplicationRepo;
	users: {
		upsertUser: (user: { steamid64: string }) =>
			| { success: true; userId: number }
			| { success: false };
	};
	steam: ApplySteamVerifier;
};
