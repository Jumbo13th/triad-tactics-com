import {
	countApplicationsByStatus,
	getApplicationsByStatus,
	getById as getApplicationById
} from '@/features/apply/infra/sqliteApplications';
import {
	clearUserRenameRequiredBySteamId64,
	confirmApplication,
	countUsersByStatus,
	decideRenameRequest,
	listRenameRequests,
	listUsers,
	setUserRenameRequiredBySteamId64
} from '@/features/admin/infra/sqliteAdmin';
import { getUserBySteamId64 } from '@/features/users/infra/sqliteUsers';
import { hasPendingRenameRequestByUserId } from '@/features/rename/infra/sqliteRenameRequests';
import type {
	ConfirmApplicationAndNotifyDeps,
	ListApplicationsDeps,
	ListRenameRequestsDeps,
	ListUsersDeps,
	RenameRequiredDeps
} from './ports';
import { enqueueApplicationApprovedEmail } from '@/platform/outbox/emailOutbox';

export const listApplicationsDeps: ListApplicationsDeps = {
	repo: {
		getApplicationsByStatus,
		countApplicationsByStatus
	}
};

export const confirmApplicationAndNotifyDeps: ConfirmApplicationAndNotifyDeps = {
	repo: {
		confirmApplication
	},
	applications: {
		getApplicationById
	},
	outbox: {
		enqueueApplicationApproved: enqueueApplicationApprovedEmail
	}
};

export const renameRequiredDeps: RenameRequiredDeps = {
	repo: {
		getUserBySteamId64,
		hasPendingRenameRequestByUserId,
		setUserRenameRequired: setUserRenameRequiredBySteamId64,
		clearUserRenameRequired: clearUserRenameRequiredBySteamId64
	}
};

export const listUsersDeps: ListUsersDeps = {
	repo: {
		listUsers,
		countUsersByStatus
	}
};

export const renameRequestsDeps: ListRenameRequestsDeps = {
	repo: {
		listRenameRequests,
		decideRenameRequest: (input) => {
			const result = decideRenameRequest(input);
			if (result.success) return { success: true as const };
			return { success: false as const, error: result.error };
		}
	}
};
