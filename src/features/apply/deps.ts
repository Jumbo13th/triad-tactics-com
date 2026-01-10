import { dbOperations } from '@/platform/db';
import { verifySteamOwnsGameOrReject } from './steam/verifyGameOwnership';
import type { SubmitApplicationDeps } from './ports';

export const submitApplicationDeps: SubmitApplicationDeps = {
	repo: {
		insertApplication: (application) => dbOperations.insertApplication(application),
		getBySteamId64: dbOperations.getBySteamId64
	},
	steam: {
		verifySteamOwnsGameOrReject
	}
};
