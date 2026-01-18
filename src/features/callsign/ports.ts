export type CallsignRepo = {
	listCallsigns: (scope?: { includeActive?: boolean; includeConfirmed?: boolean }) => string[];
};

export type CallsignDeps = {
	repo: CallsignRepo;
};
