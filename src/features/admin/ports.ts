export type AdminApplicationsRepo<TApp> = {
	getApplicationsByStatus: (status: 'active' | 'archived' | 'all') => TApp[];
	countApplicationsByStatus: (status: 'active' | 'archived' | 'all') => number;
};

export type AdminConfirmRepo = {
	confirmApplication: (
		applicationId: number,
		confirmedBySteamId64: string
	) => { success: true } | { success: false; error: 'not_found' | 'database_error' };
};

export type ListApplicationsDeps<TApp> = {
	repo: AdminApplicationsRepo<TApp>;
};

export type ConfirmApplicationDeps = {
	repo: AdminConfirmRepo;
};

export type AdminUserRenameRepo = {
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

export type AdminUsersRepo<TUser> = {
	listUsers: (status: 'all' | 'rename_required' | 'confirmed') => TUser[];
	countUsersByStatus: (status: 'all' | 'rename_required' | 'confirmed') => number;
};

export type ListUsersDeps<TUser> = {
	repo: AdminUsersRepo<TUser>;
};

export type AdminRenameRequestsRepo<TRow> = {
	listRenameRequests: (status: 'pending' | 'approved' | 'declined' | 'all') => TRow[];
	decideRenameRequest: (input: {
		requestId: number;
		decision: 'approve' | 'decline';
		decidedBySteamId64: string;
		declineReason?: string | null;
	}) => { success: true } | { success: false; error: 'not_found' | 'not_pending' | 'database_error' };
};

export type ListRenameRequestsDeps<TRow> = {
	repo: AdminRenameRequestsRepo<TRow>;
};
