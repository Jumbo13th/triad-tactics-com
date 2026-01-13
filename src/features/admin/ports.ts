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
