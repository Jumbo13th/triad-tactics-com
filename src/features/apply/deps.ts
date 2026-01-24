import {
	getBySteamId64,
	getByUserId,
	insertApplication
} from '@/features/apply/infra/sqliteApplications';
import { upsertUser } from '@/features/users/infra/sqliteUsers';
import { verifySteamOwnsGameOrReject } from './steam/verifyGameOwnership';
import type { SubmitApplicationDeps } from './ports';

export const submitApplicationDeps: SubmitApplicationDeps = {
	repo: {
		insertApplication,
		getBySteamId64,
		getByUserId
	},
	users: {
		upsertUser
	},
	steam: {
		verifySteamOwnsGameOrReject
	}
};
