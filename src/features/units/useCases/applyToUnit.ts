import type { UnitDeps } from '../ports';
import { isConfirmedPlayer, canApplyToUnit } from '../domain/rules';

export type ApplyToUnitResult =
	| { ok: true; status: 200; json: { success: true } }
	| { ok: false; status: 403; json: { error: 'not_confirmed' } }
	| { ok: false; status: 404; json: { error: 'not_found' } }
	| { ok: false; status: 409; json: { error: 'unit_not_verified' | 'already_member' | 'already_applicant' } }
	| { ok: false; status: 500; json: { error: 'server_error' } };

export function applyToUnit(deps: UnitDeps, input: { unitId: number; steamid64: string; message?: string }): ApplyToUnitResult {
	const user = deps.users.getUserBySteamId64(input.steamid64);
	if (!user) return { ok: false, status: 403, json: { error: 'not_confirmed' } };
	if (!isConfirmedPlayer(user)) return { ok: false, status: 403, json: { error: 'not_confirmed' } };

	const unit = deps.repo.getUnitById(input.unitId);
	if (!unit) return { ok: false, status: 404, json: { error: 'not_found' } };

	const existingMembership = deps.memberships.getMembershipByUserAndUnit(user.id, input.unitId);
	const existingMemberUnit = deps.memberships.getActiveMemberUnit(user.id);
	const check = canApplyToUnit(unit, existingMembership, existingMemberUnit);
	if (!check.allowed) return { ok: false, status: 409, json: { error: check.reason } };

	const message = (input.message ?? '').trim().slice(0, 2000);
	const result = deps.memberships.addMembership(input.unitId, user.id, 'applicant', message);
	if (!result.success) {
		if (result.error === 'duplicate') return { ok: false, status: 409, json: { error: 'already_applicant' } };
		return { ok: false, status: 500, json: { error: 'server_error' } };
	}

	const callsign = deps.users.getCallsign(user.id);
	deps.events.logUnitEvent({ unitId: input.unitId, kind: 'member_applied', actorCallsign: callsign });

	return { ok: true, status: 200, json: { success: true } };
}
