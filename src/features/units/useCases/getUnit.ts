import type { UnitDeps } from '../ports';
import type { Unit, UnitEvent, UnitMembership, UnitViewerContext } from '../domain/types';

export type GetUnitResult =
	| { ok: true; status: 200; json: { unit: Unit; members: UnitMembership[]; viewer: UnitViewerContext; events: UnitEvent[] } }
	| { ok: false; status: 404; json: { error: 'not_found' } };

export function getUnit(deps: UnitDeps, input: { unitId: number; viewerSteamId64: string | null; isAdmin?: boolean }): GetUnitResult {
	const unit = deps.repo.getUnitById(input.unitId);
	if (!unit) return { ok: false, status: 404, json: { error: 'not_found' } };

	const members = deps.memberships.listUnitMembers(input.unitId);

	let viewer: UnitViewerContext = { isMember: false, isApplicant: false, isLeader: false, isAdmin: input.isAdmin ?? false, hasUnitElsewhere: false, membership: null };
	if (input.viewerSteamId64) {
		const user = deps.users.getUserBySteamId64(input.viewerSteamId64);
		if (user) {
			const membership = deps.memberships.getMembershipByUserAndUnit(user.id, input.unitId);
			const memberUnit = deps.memberships.getActiveMemberUnit(user.id);
			viewer = {
				isMember: membership?.role === 'member',
				isApplicant: membership?.role === 'applicant',
				isLeader: unit.leaderUserId === user.id,
				isAdmin: input.isAdmin ?? false,
				hasUnitElsewhere: !!memberUnit && memberUnit.id !== input.unitId,
				membership
			};
		}
	}

	const events = deps.events.listUnitEvents(input.unitId);

	return { ok: true, status: 200, json: { unit, members, viewer, events } };
}
