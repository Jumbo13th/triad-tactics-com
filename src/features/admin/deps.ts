import { dbOperations } from '@/platform/db';
import type {
	ConfirmApplicationDeps,
	ListApplicationsDeps,
	ListRenameRequestsDeps,
	ListUsersDeps,
	RenameRequiredDeps
} from './ports';

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

export const renameRequiredDeps: RenameRequiredDeps = {
	repo: {
		getUserBySteamId64: dbOperations.getUserBySteamId64,
		hasPendingRenameRequestByUserId: dbOperations.hasPendingRenameRequestByUserId,
		setUserRenameRequired: dbOperations.setUserRenameRequiredBySteamId64,
		clearUserRenameRequired: dbOperations.clearUserRenameRequiredBySteamId64
	}
};

export const listUsersDeps: ListUsersDeps<ReturnType<typeof dbOperations.listUsers>[number]> = {
	repo: {
		listUsers: dbOperations.listUsers,
		countUsersByStatus: dbOperations.countUsersByStatus
	}
};

export const renameRequestsDeps: ListRenameRequestsDeps<ReturnType<typeof dbOperations.listRenameRequests>[number]> = {
	repo: {
		listRenameRequests: dbOperations.listRenameRequests,
		decideRenameRequest: (input) => {
			const result = dbOperations.decideRenameRequest(input);
			if (result.success) return { success: true as const };
			return { success: false as const, error: result.error };
		}
	}
};
