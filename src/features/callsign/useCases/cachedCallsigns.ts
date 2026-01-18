import type { CallsignDeps } from '../ports';

type CallsignCache = {
	createdAtMs: number;
	callsigns: string[];
	repoRef: CallsignDeps['repo'];
};

let cached: CallsignCache | null = null;

export function getCachedExistingCallsigns(
	deps: CallsignDeps,
	options?: { ttlMs?: number }
): string[] {
	if (process.env.NODE_ENV === 'test') {
		return deps.repo.listCallsigns({ includeActive: true, includeConfirmed: true });
	}

	const ttlMs = options?.ttlMs ?? 10_000;
	const now = Date.now();

	if (cached && cached.repoRef === deps.repo && now - cached.createdAtMs < ttlMs) {
		return cached.callsigns;
	}

	const callsigns = deps.repo.listCallsigns({ includeActive: true, includeConfirmed: true });
	cached = { createdAtMs: now, callsigns, repoRef: deps.repo };
	return callsigns;
}
