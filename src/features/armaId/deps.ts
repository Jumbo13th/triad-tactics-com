import {
	getOrCreateUserBySteamId64,
	setArmaGuidByUserId,
	isArmaGuidTaken
} from '@/features/users/infra/sqliteUsers';
import type { SetArmaGuidDeps } from './ports';

export const setArmaGuidDeps: SetArmaGuidDeps = {
	users: {
		getOrCreateUserBySteamId64,
		setArmaGuidByUserId,
		isArmaGuidTaken
	}
};
