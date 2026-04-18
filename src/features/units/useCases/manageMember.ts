import type { UnitDeps } from '../ports';
import { manageMemberRequestSchema } from '../domain/requests';
import { canManageMembers } from '../domain/rules';

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
	if (!actor || !canManageMembers(unit, actor.id, input.isAdmin)) {
		return { ok: false, status: 403, json: { error: 'forbidden' } };
	}

	const parsed = manageMemberRequestSchema.safeParse(input.body);
	if (!parsed.success) return { ok: false, status: 400, json: { error: 'validation_error', details: parsed.error.flatten() } };

	const { userId, action, role } = parsed.data;
	const actorCallsign = deps.users.getCallsign(actor.id);

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
			deps.events.logUnitEvent({ unitId: input.unitId, kind: 'member_approved', targetCallsign: approvedCallsign, actorCallsign: actorCallsign });
			return { ok: true, status: 200, json: { success: true } };
		}
		case 'reject': {
			const result = deps.memberships.removeMembership(input.unitId, userId);
			if (!result.success) return { ok: false, status: 404, json: { error: 'member_not_found' } };
			const rejectedCallsign = deps.users.getCallsign(userId);
			deps.events.logUnitEvent({ unitId: input.unitId, kind: 'applicant_rejected', targetCallsign: rejectedCallsign, actorCallsign: actorCallsign });
			return { ok: true, status: 200, json: { success: true } };
		}
		case 'remove': {
			if (unit.leaderUserId === userId && !input.isAdmin) {
				return { ok: false, status: 403, json: { error: 'forbidden' } };
			}
			const removedCallsign = deps.users.getCallsign(userId);
			const result = deps.memberships.removeMembership(input.unitId, userId);
			if (!result.success) return { ok: false, status: 404, json: { error: 'member_not_found' } };
			deps.events.logUnitEvent({ unitId: input.unitId, kind: 'member_removed', targetCallsign: removedCallsign, actorCallsign: actorCallsign });
			if (unit.leaderUserId === userId && input.isAdmin) {
				deps.repo.clearUnitLeader(input.unitId);
			}
			return { ok: true, status: 200, json: { success: true } };
		}
		case 'set_role': {
			if (!role) return { ok: false, status: 400, json: { error: 'validation_error', details: { role: 'required for set_role action' } } };
			if (role === 'member') {
				const existingMemberUnit = deps.memberships.getActiveMemberUnit(userId);
				if (existingMemberUnit && existingMemberUnit.id !== input.unitId) {
					return { ok: false, status: 409, json: { error: 'already_member_elsewhere' } };
				}
			}
			const result = deps.memberships.updateMembershipRole(input.unitId, userId, role);
			if (!result.success) return { ok: false, status: 404, json: { error: 'member_not_found' } };
			return { ok: true, status: 200, json: { success: true } };
		}
	}
}
