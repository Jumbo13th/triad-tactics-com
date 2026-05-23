import {
	countApplicationsByStatus,
	countApplications,
	getApplicationsByStatus,
	getApplicationsPage,
	getById as getApplicationById,
	markApprovalEmailSent
} from '@/features/apply/infra/sqliteApplications';
import {
	assignBadgeToUser,
	clearUserRenameRequiredBySteamId64,
	confirmApplication,
	countUsers,
	countUsersByStatus,
	createBadgeType,
	decideRenameRequest,
	listBadgeTypes,
	listRenameRequests,
	listUsers,
	listUsersPage,
	removeBadgeFromUser,
	setUserRenameRequiredBySteamId64,
	updateBadgeTypeDiscordRoleId,
	updateBadgeTypeStatus
} from '@/features/admin/infra/sqliteAdmin';
import { getUserBySteamId64 } from '@/features/users/infra/sqliteUsers';
import { hasPendingRenameRequestByUserId } from '@/features/rename/infra/sqliteRenameRequests';
import type {
	AssignUserBadgeDeps,
	ConfirmApplicationAndNotifyDeps,
	CreateBadgeTypeDeps,
	ListApplicationsDeps,
	ListBadgeTypesDeps,
	ListRenameRequestsDeps,
	ListUsersDeps,
	RemoveUserBadgeDeps,
	RenameRequiredDeps,
	UpdateBadgeTypeDiscordRoleDeps,
	UpdateBadgeTypeStatusDeps
} from './ports';
import { enqueueOutboxEmail } from '@/platform/outbox/emailOutbox';
import { buildApprovalContent, buildApprovedBroadcastContent } from '@/platform/email/brevo';

export const listApplicationsDeps: ListApplicationsDeps = {
	repo: {
		getApplicationsPage,
		getApplicationsByStatus,
		countApplications,
		countApplicationsByStatus
	}
};

export const confirmApplicationAndNotifyDeps: ConfirmApplicationAndNotifyDeps = {
	repo: {
		confirmApplication
	},
	applications: {
		getApplicationById,
		markApprovalEmailSent
	},
	outbox: {
		enqueueOutboxEmail
	},
	email: {
		buildApprovalContent
	}
};

export const sendMailingDeps = {
	repo: {
		getApplicationsPage,
		getApplicationsByStatus,
		countApplications,
		countApplicationsByStatus
	},
	outbox: {
		enqueueOutboxEmail
	},
	email: {
		buildApprovedBroadcastContent
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
		listUsersPage,
		countUsers,
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

export const listBadgeTypesDeps: ListBadgeTypesDeps = {
	repo: {
		listBadgeTypes
	}
};

export const createBadgeTypeDeps: CreateBadgeTypeDeps = {
	repo: {
		createBadgeType
	}
};

export const updateBadgeTypeStatusDeps: UpdateBadgeTypeStatusDeps = {
	repo: {
		updateBadgeTypeStatus
	}
};

export const assignUserBadgeDeps: AssignUserBadgeDeps = {
	repo: {
		assignBadgeToUser
	}
};

export const removeUserBadgeDeps: RemoveUserBadgeDeps = {
	repo: {
		removeBadgeFromUser
	}
};

export const updateBadgeTypeDiscordRoleDeps: UpdateBadgeTypeDiscordRoleDeps = {
	repo: {
		updateBadgeTypeDiscordRoleId
	}
};
