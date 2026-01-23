import type { Application } from '@/features/apply/domain/types';
import type { AdminRenameRequestRow, AdminUserRow } from '@/features/admin/domain/types';

export type AdminApplicationsRepo = {
	getApplicationsByStatus: (status: 'active' | 'archived' | 'all') => Application[];
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
	enqueueApplicationApproved: (input: {
		applicationId: number;
		toEmail: string;
		toName?: string | null;
		callsign?: string | null;
		locale?: string | null;
	}) => { success: true } | { success: false; error: 'duplicate' | 'database_error' };
};

export type ConfirmApplicationAndNotifyDeps = {
	repo: AdminConfirmRepo;
	applications: {
		getApplicationById: (applicationId: number) => Application | null;
	};
	outbox: EmailOutboxPort;
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
