import type { Unit, UnitMembership } from './types';

export function isConfirmedPlayer(user: { player_confirmed_at?: string | null }): boolean {
	return !!user.player_confirmed_at;
}

export function isUnitLeader(membership: UnitMembership | null): boolean {
	return membership?.role === 'leader';
}

export function isUnitDeputy(membership: UnitMembership | null): boolean {
	return membership?.role === 'deputy';
}

function hasLeadershipAccess(isAdmin: boolean, membership?: UnitMembership | null): boolean {
	if (isAdmin) return true;
	if (isUnitLeader(membership ?? null)) return true;
	return membership !== undefined && isUnitDeputy(membership);
}

export function canEditUnit(isAdmin: boolean, membership?: UnitMembership | null): boolean {
	return hasLeadershipAccess(isAdmin, membership);
}

export function canManageMembers(isAdmin: boolean, membership?: UnitMembership | null): boolean {
	return hasLeadershipAccess(isAdmin, membership);
}

export function canApplyToUnit(
	unit: Unit,
	existingMembership: UnitMembership | null,
	existingMemberUnit: { id: number } | null
): { allowed: true } | { allowed: false; reason: 'unit_not_verified' | 'already_member' | 'already_applicant' } {
	if (unit.status !== 'verified') return { allowed: false, reason: 'unit_not_verified' };
	if (existingMemberUnit) return { allowed: false, reason: 'already_member' };
	if (existingMembership?.role === 'applicant') return { allowed: false, reason: 'already_applicant' };
	return { allowed: true };
}

export function canLeaveUnit(membership: UnitMembership | null): { allowed: true } | { allowed: false; reason: 'is_leader' } {
	if (isUnitLeader(membership)) return { allowed: false, reason: 'is_leader' };
	return { allowed: true };
}
