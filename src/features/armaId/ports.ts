export type ArmaIdUsersRepo = {
	getOrCreateUserBySteamId64: (input: { steamid64: string }) =>
		| { success: true; user: { id: number; arma_guid?: string | null } }
		| { success: false; error: 'database_error' };
	setArmaGuidByUserId: (input: { userId: number; armaGuid: string }) =>
		| { success: true }
		| { success: false; error: 'not_found' | 'duplicate' | 'database_error' };
	isArmaGuidTaken: (armaGuid: string, excludeUserId?: number) => boolean;
};

export type SetArmaGuidDeps = {
	users: ArmaIdUsersRepo;
};
