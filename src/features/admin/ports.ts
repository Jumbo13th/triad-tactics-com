import type { Application } from '@/features/apply/domain/types';
import type { AdminBadgeType, AdminRenameRequestRow, AdminUserBadge, AdminUserRow } from '@/features/admin/domain/types';

export type AdminApplicationsRepo = {
	getApplicationsByStatus: (status: 'active' | 'archived' | 'all') => Application[];
	getApplicationsPage: (input: {
		status: 'active' | 'archived' | 'all';
		query?: string;
		page: number;
		pageSize: number;
	}) => Application[];
	countApplications: (input: { status: 'active' | 'archived' | 'all'; query?: string }) => number;
	countApplicationsByStatus: (status: 'active' | 'archived' | 'all') => number;
};

export type AdminConfirmRepo = {
	confirmApplication: (
		applicationId: number,
		confirmedBySteamId64: string
	) => { success: true } | { success: false; error: 'not_found' | 'database_error' };
};

export type ListApplicationsDeps = {
	repo: AdminApplicationsRepo;
};

export type EmailOutboxPort = {
	enqueueOutboxEmail: (input: {
		userId?: number | null;
		type?: string;
		payload: {
			toEmail: string;
			toName?: string | null;
			subject: string;
			textContent: string;
			tags?: string[];
		};
	}) => { success: true } | { success: false; error: 'duplicate' | 'database_error' };
};

export type ApprovalEmailBuilder = (input: {
	toEmail: string;
	toName?: string | null;
	callsign?: string | null;
	locale?: string | null;
	renameRequired?: boolean;
}) => Promise<{ subject: string; textContent: string }>;

export type ApprovedBroadcastBuilder = (input: {
	toEmail: string;
	toName?: string | null;
	callsign?: string | null;
	locale?: string | null;
	subjectTemplate: string;
	bodyTemplate: string;
}) => { subject: string; textContent: string };

export type ConfirmApplicationAndNotifyDeps = {
	repo: AdminConfirmRepo;
	applications: {
		getApplicationById: (applicationId: number) => Application | null;
		markApprovalEmailSent: (applicationId: number) => { success: true; changes: number } | { success: false; error: 'database_error' };
	};
	outbox: EmailOutboxPort;
	email: {
		buildApprovalContent: ApprovalEmailBuilder;
	};
};

export type AdminUserRenameRepo = {
	getUserBySteamId64: (steamid64: string) =>
		| {
				id: number;
				player_confirmed_at?: string | null;
				rename_required_at?: string | null;
		  }
		| null;
	hasPendingRenameRequestByUserId: (userId: number) => boolean;
	setUserRenameRequired: (input: {
		steamid64: string;
		requestedBySteamId64: string;
		reason?: string | null;
	}) => { success: boolean } | { success: false; error: 'database_error' };
	clearUserRenameRequired: (steamid64: string) =>
		| { success: boolean }
		| { success: false; error: 'not_found' | 'database_error' };
};

export type RenameRequiredDeps = {
	repo: AdminUserRenameRepo;
};

export type AdminUsersRepo = {
	listUsers: (status: 'all' | 'rename_required' | 'confirmed') => AdminUserRow[];
	listUsersPage: (input: {
		status: 'all' | 'rename_required' | 'confirmed';
		query?: string;
		page: number;
		pageSize: number;
	}) => AdminUserRow[];
	countUsers: (input: { status: 'all' | 'rename_required' | 'confirmed'; query?: string }) => number;
	countUsersByStatus: (status: 'all' | 'rename_required' | 'confirmed') => number;
};

export type ListUsersDeps = {
	repo: AdminUsersRepo;
};

export type AdminRenameRequestsRepo = {
	listRenameRequests: (status: 'pending' | 'approved' | 'declined' | 'all') => AdminRenameRequestRow[];
	decideRenameRequest: (input: {
		requestId: number;
		decision: 'approve' | 'decline';
		decidedBySteamId64: string;
		declineReason?: string | null;
	}) => { success: true } | { success: false; error: 'not_found' | 'not_pending' | 'database_error' };
};

export type ListRenameRequestsDeps = {
	repo: AdminRenameRequestsRepo;
};

export type SendMailingDeps = {
	repo: AdminApplicationsRepo;
	outbox: EmailOutboxPort;
	email: {
		buildApprovedBroadcastContent: ApprovedBroadcastBuilder;
	};
};

export type AdminBadgesRepo = {
	listBadgeTypes: () => AdminBadgeType[];
	createBadgeType: (input: {
		label: string;
		createdBySteamId64: string;
	}) => { success: true; badge: AdminBadgeType } | { success: false; error: 'database_error' };
	updateBadgeTypeStatus: (input: {
		badgeTypeId: number;
		status: 'active' | 'retired';
		updatedBySteamId64: string;
	}) => { success: true; badge: AdminBadgeType } | { success: false; error: 'not_found' | 'database_error' };
	assignBadgeToUser: (input: {
		userId: number;
		badgeTypeId: number;
		assignedBySteamId64: string;
	}) => { success: true; badges: AdminUserBadge[] } | { success: false; error: 'not_found' | 'badge_retired' | 'database_error' };
	removeBadgeFromUser: (input: {
		userId: number;
		badgeTypeId: number;
	}) => { success: true; badges: AdminUserBadge[] } | { success: false; error: 'not_found' | 'database_error' };
	updateBadgeTypeDiscordRoleId: (input: {
		badgeTypeId: number;
		discordRoleId: string | null;
		updatedBySteamId64: string;
	}) => { success: true; badge: AdminBadgeType } | { success: false; error: 'not_found' | 'database_error' };
};

export type ListBadgeTypesDeps = {
	repo: Pick<AdminBadgesRepo, 'listBadgeTypes'>;
};

export type CreateBadgeTypeDeps = {
	repo: Pick<AdminBadgesRepo, 'createBadgeType'>;
};

export type UpdateBadgeTypeStatusDeps = {
	repo: Pick<AdminBadgesRepo, 'updateBadgeTypeStatus'>;
};

export type AssignUserBadgeDeps = {
	repo: Pick<AdminBadgesRepo, 'assignBadgeToUser'>;
};

export type RemoveUserBadgeDeps = {
	repo: Pick<AdminBadgesRepo, 'removeBadgeFromUser'>;
};

export type UpdateBadgeTypeDiscordRoleDeps = {
	repo: Pick<AdminBadgesRepo, 'updateBadgeTypeDiscordRoleId'>;
};
