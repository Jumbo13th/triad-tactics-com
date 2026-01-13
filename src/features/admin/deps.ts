import { dbOperations } from '@/platform/db';
import type { ConfirmApplicationDeps, ListApplicationsDeps } from './ports';

export const listApplicationsDeps: ListApplicationsDeps<ReturnType<typeof dbOperations.getAllApplications>[number]> = {
	repo: {
		getApplicationsByStatus: dbOperations.getApplicationsByStatus,
		countApplicationsByStatus: dbOperations.countApplicationsByStatus
	}
};

export const confirmApplicationDeps: ConfirmApplicationDeps = {
	repo: {
		confirmApplication: dbOperations.confirmApplication
	}
};
