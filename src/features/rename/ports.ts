export type RenameUsersRepo = {
	getOrCreateUserBySteamId64: (input: { steamid64: string }) =>
		| { success: true; user: { id: number } }
		| { success: false; error: 'database_error' };
};

export type RenameRequestsRepo = {
	hasPendingByUserId: (userId: number) => boolean;
	createRenameRequest: (input: { userId: number; newCallsign: string }) =>
		| { success: true; id: unknown }
		| { success: false; error: 'rename_not_required' | 'duplicate_pending' | 'not_found' | 'database_error' };
};

export type RenameCallsignChecker = {
	hasExactMatch: (callsign: string) => boolean;
};

export type SubmitRenameRequestDeps = {
	users: RenameUsersRepo;
	renameRequests: RenameRequestsRepo;
	callsigns: RenameCallsignChecker;
};
