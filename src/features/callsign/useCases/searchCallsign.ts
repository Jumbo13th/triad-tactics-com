import type { CallsignDeps } from '../ports';
import { getCachedExistingCallsigns } from './cachedCallsigns';

export type SearchCallsignResult =
	| { ok: true; query: string; results: string[]; total: number }
	| { ok: false; error: 'invalid_request' | 'server_error' };

export function searchCallsign(deps: CallsignDeps, input: { query: unknown }): SearchCallsignResult {
	if (typeof input.query !== 'string') {
		return { ok: false, error: 'invalid_request' };
	}

	const query = input.query.trim();
	if (query.length < 2 || query.length > 50) {
		return { ok: false, error: 'invalid_request' };
	}
	if (!/^[A-Za-z0-9_]+$/.test(query)) {
		return { ok: false, error: 'invalid_request' };
	}

	try {
		const existing = getCachedExistingCallsigns(deps);
		const q = query.toLowerCase();
		const filtered = existing.filter((c) => c.toLowerCase().includes(q));
		const results = filtered.slice(0, 25);
		return { ok: true, query, results, total: filtered.length };
	} catch {
		return { ok: false, error: 'server_error' };
	}
}
