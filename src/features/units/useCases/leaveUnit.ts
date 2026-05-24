import type { UnitDeps } from '../ports';
import { canLeaveUnit } from '../domain/rules';

export type LeaveUnitResult =
	| { ok: true; status: 200; json: { success: true } }
	| { ok: false; status: 403; json: { error: 'not_confirmed' | 'is_leader' } }
	| { ok: false; status: 404; json: { error: 'not_found' | 'not_member' } }
	| { ok: false; status: 500; json: { error: 'server_error' } };

export function leaveUnit(deps: UnitDeps, input: { unitId: number; steamid64: string }): LeaveUnitResult {
	const user = deps.users.getUserBySteamId64(input.steamid64);
	if (!user) return { ok: false, status: 403, json: { error: 'not_confirmed' } };

	const unit = deps.repo.getUnitById(input.unitId);
	if (!unit) return { ok: false, status: 404, json: { error: 'not_found' } };

	const membership = deps.memberships.getMembershipByUserAndUnit(user.id, input.unitId);
	const check = canLeaveUnit(membership);
	if (!check.allowed) return { ok: false, status: 403, json: { error: check.reason } };

	const callsign = deps.users.getCallsign(user.id);
	const wasApplicant = membership?.role === 'applicant';

	const result = deps.memberships.removeMembership(input.unitId, user.id);
	if (!result.success) return { ok: false, status: 404, json: { error: 'not_member' } };

	deps.events.logUnitEvent({
		unitId: input.unitId,
		kind: wasApplicant ? 'application_withdrawn' : 'member_left',
		actorCallsign: callsign
	});

	return { ok: true, status: 200, json: { success: true } };
}
