import type { CallsignDeps } from '../ports';
import { findCallsignConflicts } from '../match';
import { getCachedExistingCallsigns } from './cachedCallsigns';

export type CheckCallsignResult =
	| { ok: true; normalized: string; exactMatches: string[]; soundMatches: string[] }
	| { ok: false; error: 'invalid_request' | 'server_error' };

export function checkCallsign(deps: CallsignDeps, input: { callsign: unknown }): CheckCallsignResult {
	if (typeof input.callsign !== 'string') {
		return { ok: false, error: 'invalid_request' };
	}
	const callsign = input.callsign.trim();
	if (callsign.length < 3 || callsign.length > 100) {
		return { ok: false, error: 'invalid_request' };
	}
	if (!/^[A-Za-z0-9_]+$/.test(callsign)) {
		return { ok: false, error: 'invalid_request' };
	}

	try {
		const existing = getCachedExistingCallsigns(deps);
		const conflicts = findCallsignConflicts(callsign, existing);
		return {
			ok: true,
			normalized: conflicts.normalized,
			exactMatches: conflicts.exactMatches,
			soundMatches: conflicts.soundMatches
		};
	} catch {
		return { ok: false, error: 'server_error' };
	}
}
