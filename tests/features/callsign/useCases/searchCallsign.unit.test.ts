import { describe, expect, it } from 'vitest';
import { searchCallsign } from '@/features/callsign/useCases/searchCallsign';
import type { CallsignDeps } from '@/features/callsign/ports';

function makeDeps(overrides?: { repo?: Partial<CallsignDeps['repo']> }): CallsignDeps {
	const deps: CallsignDeps = {
		repo: {
			listCallsigns: () => []
		}
	};

	return {
		...deps,
		...overrides,
		repo: { ...deps.repo, ...(overrides?.repo ?? {}) }
	};
}

describe('callsign/searchCallsign (use case)', () => {
	it('rejects invalid request shapes', () => {
		const deps = makeDeps();
		expect(searchCallsign(deps, { query: null })).toEqual({ ok: false, error: 'invalid_request' });
		expect(searchCallsign(deps, { query: 123 })).toEqual({ ok: false, error: 'invalid_request' });
	});

	it('rejects empty queries and overly long queries', () => {
		const deps = makeDeps();
		expect(searchCallsign(deps, { query: '' })).toEqual({ ok: false, error: 'invalid_request' });
		expect(searchCallsign(deps, { query: ' '.repeat(3) })).toEqual({ ok: false, error: 'invalid_request' });
		expect(searchCallsign(deps, { query: 'a'.repeat(51) })).toEqual({ ok: false, error: 'invalid_request' });
	});

	it('searches case-insensitively and returns total separately from results', () => {
		const deps = makeDeps({ repo: { listCallsigns: () => ['Alpha', 'Alpine', 'BRAVO'] } });
		const res = searchCallsign(deps, { query: 'al' });
		if (!res.ok) throw new Error('Expected ok result');
		expect(res.query).toBe('al');
		expect(res.results).toEqual(['Alpha', 'Alpine']);
		expect(res.total).toBe(2);
	});

	it('caps results to 25 but keeps total', () => {
		const callsigns = Array.from({ length: 30 }, (_, i) => `User_${String(i).padStart(2, '0')}`);
		const deps = makeDeps({ repo: { listCallsigns: () => callsigns } });
		const res = searchCallsign(deps, { query: 'User_' });
		if (!res.ok) throw new Error('Expected ok result');
		expect(res.total).toBe(30);
		expect(res.results).toHaveLength(25);
	});

	it('returns server_error if repo throws', () => {
		const deps = makeDeps({
			repo: {
				listCallsigns: () => {
					throw new Error('db down');
				}
			}
		});
		expect(searchCallsign(deps, { query: 'Alpha' })).toEqual({ ok: false, error: 'server_error' });
	});
});
