import { describe, expect, it } from 'vitest';
import { checkCallsign } from '@/features/callsign/useCases/checkCallsign';
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

describe('callsign/checkCallsign (use case)', () => {
	it('rejects invalid request shapes', () => {
		const deps = makeDeps();

		expect(checkCallsign(deps, { callsign: null })).toEqual({ ok: false, error: 'invalid_request' });
		expect(checkCallsign(deps, { callsign: 123 })).toEqual({ ok: false, error: 'invalid_request' });
	});

	it('rejects callsigns shorter than 3', () => {
		const deps = makeDeps();
		expect(checkCallsign(deps, { callsign: 'ab' })).toEqual({ ok: false, error: 'invalid_request' });
	});

	it('rejects callsigns with invalid characters', () => {
		const deps = makeDeps();
		expect(checkCallsign(deps, { callsign: 'Bad Name' })).toEqual({ ok: false, error: 'invalid_request' });
		expect(checkCallsign(deps, { callsign: 'Bad-Name' })).toEqual({ ok: false, error: 'invalid_request' });
		expect(checkCallsign(deps, { callsign: 'Имя' })).toEqual({ ok: false, error: 'invalid_request' });
	});

	it('returns ok=true with empty matches when available', () => {
		const deps = makeDeps({ repo: { listCallsigns: () => ['Alpha', 'Bravo'] } });
		const res = checkCallsign(deps, { callsign: 'Charlie' });
		if (!res.ok) throw new Error('Expected ok result');
		expect(res.exactMatches).toEqual([]);
		expect(res.soundMatches).toEqual([]);
	});

	it('detects a sound-alike conflict (Ghost vs G0st)', () => {
		const deps = makeDeps({ repo: { listCallsigns: () => ['G0st'] } });
		const res = checkCallsign(deps, { callsign: 'Ghost' });
		if (!res.ok) throw new Error('Expected ok result');
		expect(res.exactMatches).toEqual([]);
		expect(res.soundMatches).toEqual(['G0st']);
	});

	it('returns server_error if repo throws', () => {
		const deps = makeDeps({
			repo: {
				listCallsigns: () => {
					throw new Error('db down');
				}
			}
		});
		expect(checkCallsign(deps, { callsign: 'Valid_One' })).toEqual({ ok: false, error: 'server_error' });
	});
});
