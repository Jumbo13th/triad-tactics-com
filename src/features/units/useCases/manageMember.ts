import type { UnitDeps } from '../ports';
import { manageMemberRequestSchema } from '../domain/requests';
import { canManageMembers, isUnitDeputy } from '../domain/rules';

export type ManageMemberResult =
	| { ok: true; status: 200; json: { success: true } }
	| { ok: false; status: 400; json: { error: 'validation_error'; details: unknown } }
	| { ok: false; status: 403; json: { error: 'forbidden' } }
	| { ok: false; status: 404; json: { error: 'not_found' | 'member_not_found' } }
	| { ok: false; status: 409; json: { error: 'already_member_elsewhere' } }
	| { ok: false; status: 500; json: { error: 'server_error' } };

export function manageMember(deps: UnitDeps, input: {
	unitId: number;
	body: unknown;
	steamid64: string;
	isAdmin: boolean;
}): ManageMemberResult {
	const unit = deps.repo.getUnitById(input.unitId);
	if (!unit) return { ok: false, status: 404, json: { error: 'not_found' } };

	const actor = deps.users.getUserBySteamId64(input.steamid64);
	if (!actor) return { ok: false, status: 403, json: { error: 'forbidden' } };

	const actorMembership = deps.memberships.getMembershipByUserAndUnit(actor.id, input.unitId);
	if (!canManageMembers(input.isAdmin, actorMembership)) {
		return { ok: false, status: 403, json: { error: 'forbidden' } };
	}

	const parsed = manageMemberRequestSchema.safeParse(input.body);
	if (!parsed.success) return { ok: false, status: 400, json: { error: 'validation_error', details: parsed.error.flatten() } };

	const { userId, action, role } = parsed.data;
	const actorCallsign = deps.users.getCallsign(actor.id);
	const actorIsDeputy = isUnitDeputy(actorMembership);

	switch (action) {
		case 'approve': {
			const existingMemberUnit = deps.memberships.getActiveMemberUnit(userId);
			if (existingMemberUnit && existingMemberUnit.id !== input.unitId) {
				return { ok: false, status: 409, json: { error: 'already_member_elsewhere' } };
			}
			const result = deps.memberships.updateMembershipRole(input.unitId, userId, 'member');
			if (!result.success) return { ok: false, status: 404, json: { error: 'member_not_found' } };
			deps.memberships.removeOtherApplications(userId, input.unitId);
			const approvedCallsign = deps.users.getCallsign(userId);
			deps.events.logUnitEvent({ unitId: input.unitId, kind: 'member_approved', targetCallsign: approvedCallsign, actorCallsign });
			return { ok: true, status: 200, json: { success: true } };
		}
		case 'reject': {
			const result = deps.memberships.removeMembership(input.unitId, userId);
			if (!result.success) return { ok: false, status: 404, json: { error: 'member_not_found' } };
			const rejectedCallsign = deps.users.getCallsign(userId);
			deps.events.logUnitEvent({ unitId: input.unitId, kind: 'applicant_rejected', targetCallsign: rejectedCallsign, actorCallsign });
			return { ok: true, status: 200, json: { success: true } };
		}
		case 'remove': {
			const targetMembershipForRemove = deps.memberships.getMembershipByUserAndUnit(userId, input.unitId);
			if (!input.isAdmin && (targetMembershipForRemove?.role === 'leader' || (actorIsDeputy && targetMembershipForRemove?.role === 'deputy'))) {
				return { ok: false, status: 403, json: { error: 'forbidden' } };
			}
			const removedCallsign = deps.users.getCallsign(userId);
			const result = deps.memberships.removeMembership(input.unitId, userId);
			if (!result.success) return { ok: false, status: 404, json: { error: 'member_not_found' } };
			deps.events.logUnitEvent({ unitId: input.unitId, kind: 'member_removed', targetCallsign: removedCallsign, actorCallsign });
			return { ok: true, status: 200, json: { success: true } };
		}
		case 'set_role': {
			if (!role) return { ok: false, status: 400, json: { error: 'validation_error', details: { role: 'required for set_role action' } } };
			if (actorIsDeputy && !input.isAdmin) {
				const targetMembership = deps.memberships.getMembershipByUserAndUnit(userId, input.unitId);
				if (targetMembership?.role === 'leader' || targetMembership?.role === 'deputy' || role === 'deputy') {
					return { ok: false, status: 403, json: { error: 'forbidden' } };
				}
			}
			if (role === 'member' || role === 'deputy') {
				const existingMemberUnit = deps.memberships.getActiveMemberUnit(userId);
				if (existingMemberUnit && existingMemberUnit.id !== input.unitId) {
					return { ok: false, status: 409, json: { error: 'already_member_elsewhere' } };
				}
			}
			const targetCallsign = deps.users.getCallsign(userId);
			const previousRole = deps.memberships.getMembershipByUserAndUnit(userId, input.unitId)?.role;
			const result = deps.memberships.updateMembershipRole(input.unitId, userId, role);
			if (!result.success) return { ok: false, status: 404, json: { error: 'member_not_found' } };
			if (role === 'deputy' && previousRole !== 'deputy') {
				deps.events.logUnitEvent({ unitId: input.unitId, kind: 'deputy_promoted', targetCallsign, actorCallsign });
			} else if (role !== 'deputy' && previousRole === 'deputy') {
				deps.events.logUnitEvent({ unitId: input.unitId, kind: 'deputy_demoted', targetCallsign, actorCallsign });
			}
			return { ok: true, status: 200, json: { success: true } };
		}
	}
}
