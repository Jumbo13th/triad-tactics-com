import type { UnitDeps } from '../ports';
import { adminSetLeaderRequestSchema } from '../domain/requests';

export type AdminSetLeaderResult =
	| { ok: true; status: 200; json: { success: true } }
	| { ok: false; status: 400; json: { error: 'validation_error'; details: unknown } }
	| { ok: false; status: 404; json: { error: 'not_found' | 'not_member' } }
	| { ok: false; status: 500; json: { error: 'server_error' } };

export function adminSetLeader(deps: UnitDeps, input: {
	unitId: number;
	body: unknown;
}): AdminSetLeaderResult {
	const parsed = adminSetLeaderRequestSchema.safeParse(input.body);
	if (!parsed.success) return { ok: false, status: 400, json: { error: 'validation_error', details: parsed.error.flatten() } };

	const result = deps.repo.setUnitLeader(input.unitId, parsed.data.userId);
	if (!result.success) {
		if (result.error === 'not_found') return { ok: false, status: 404, json: { error: 'not_found' } };
		if (result.error === 'not_member') return { ok: false, status: 404, json: { error: 'not_member' } };
		return { ok: false, status: 500, json: { error: 'server_error' } };
	}
	const newLeaderCallsign = deps.users.getCallsign(parsed.data.userId);
	deps.events.logUnitEvent({ unitId: input.unitId, kind: 'leader_changed', targetCallsign: newLeaderCallsign });
	return { ok: true, status: 200, json: { success: true } };
}
