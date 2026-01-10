import { dbOperations } from '@/platform/db';
import type { ListApplicationsDeps } from './ports';

export const listApplicationsDeps: ListApplicationsDeps<ReturnType<typeof dbOperations.getAllApplications>[number]> = {
	repo: {
		getAllApplications: dbOperations.getAllApplications
	}
};
