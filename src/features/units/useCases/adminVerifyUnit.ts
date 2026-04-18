import type { UnitDeps } from '../ports';
import { adminVerifyUnitRequestSchema } from '../domain/requests';

export type AdminVerifyUnitResult =
	| { ok: true; status: 200; json: { success: true } }
	| { ok: false; status: 400; json: { error: 'validation_error'; details: unknown } }
	| { ok: false; status: 404; json: { error: 'not_found' } }
	| { ok: false; status: 409; json: { error: 'invalid_transition' } }
	| { ok: false; status: 500; json: { error: 'server_error' } };

export function adminVerifyUnit(deps: UnitDeps, input: {
	unitId: number;
	body: unknown;
	steamid64: string;
}): AdminVerifyUnitResult {
	const parsed = adminVerifyUnitRequestSchema.safeParse(input.body);
	if (!parsed.success) return { ok: false, status: 400, json: { error: 'validation_error', details: parsed.error.flatten() } };

	const adminUser = deps.users.getUserBySteamId64(input.steamid64);
	const adminCallsign = adminUser ? deps.users.getCallsign(adminUser.id) : null;

	if (parsed.data.action === 'verify') {
		const result = deps.repo.verifyUnit(input.unitId, input.steamid64);
		if (!result.success) {
			if (result.error === 'not_found') return { ok: false, status: 404, json: { error: 'not_found' } };
			if (result.error === 'invalid_transition') return { ok: false, status: 409, json: { error: 'invalid_transition' } };
			return { ok: false, status: 500, json: { error: 'server_error' } };
		}
		deps.events.logUnitEvent({ unitId: input.unitId, kind: 'verified', actorCallsign: adminCallsign });
		return { ok: true, status: 200, json: { success: true } };
	} else if (parsed.data.action === 'unverify') {
		const result = deps.repo.unverifyUnit(input.unitId, input.steamid64);
		if (!result.success) {
			if (result.error === 'not_found') return { ok: false, status: 404, json: { error: 'not_found' } };
			if (result.error === 'already_unverified') return { ok: false, status: 409, json: { error: 'invalid_transition' } };
			return { ok: false, status: 500, json: { error: 'server_error' } };
		}
		deps.events.logUnitEvent({ unitId: input.unitId, kind: 'unverified', actorCallsign: adminCallsign });
		return { ok: true, status: 200, json: { success: true } };
	} else {
		const result = deps.repo.deleteUnit(input.unitId);
		if (!result.success) {
			if (result.error === 'not_found') return { ok: false, status: 404, json: { error: 'not_found' } };
			return { ok: false, status: 500, json: { error: 'server_error' } };
		}
		return { ok: true, status: 200, json: { success: true } };
	}
}
