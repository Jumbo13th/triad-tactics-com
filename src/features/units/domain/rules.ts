import type { Unit, UnitMembership } from './types';

export function isConfirmedPlayer(user: { player_confirmed_at?: string | null }): boolean {
	return !!user.player_confirmed_at;
}

export function isUnitLeader(unit: Unit, userId: number): boolean {
	return unit.leaderUserId === userId;
}

export function canEditUnit(unit: Unit, userId: number, isAdmin: boolean): boolean {
	if (isAdmin) return true;
	return unit.status === 'verified' && isUnitLeader(unit, userId);
}

export function canManageMembers(unit: Unit, userId: number, isAdmin: boolean): boolean {
	if (isAdmin) return true;
	return isUnitLeader(unit, userId);
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

export function canLeaveUnit(unit: Unit, userId: number): { allowed: true } | { allowed: false; reason: 'is_leader' } {
	if (isUnitLeader(unit, userId)) return { allowed: false, reason: 'is_leader' };
	return { allowed: true };
}
