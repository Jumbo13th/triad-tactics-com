export type AdminApplicationsRepo<TApp> = {
	getAllApplications: () => TApp[];
};

export type ListApplicationsDeps<TApp> = {
	repo: AdminApplicationsRepo<TApp>;
};
