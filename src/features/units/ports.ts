import type { Unit, UnitEvent, UnitEventKind, UnitMembership, UnitMemberRole, UnitStatus, UnitSummary } from './domain/types';

export type UnitRepo = {
	createUnit: (input: {
		name: string;
		tag: string;
		description: string;
		memberNames: string;
		history: string;
		otherProjects: string;
		creatorUserId: number;
	}) => { success: true; unitId: number } | { success: false; error: 'tag_taken' | 'name_taken' | 'database_error' };

	getUnitById: (unitId: number) => Unit | null;

	getUnitIdByTag: (tag: string) => number | null;

	listUnits: (input: {
		status?: UnitStatus;
		query?: string;
		hasSlots?: boolean;
		page?: number;
		pageSize?: number;
	}) => UnitSummary[];

	countUnits: (input: { status?: UnitStatus; query?: string; hasSlots?: boolean }) => number;

	updateUnit: (
		unitId: number,
		input: { name?: string; tag?: string; description?: string }
	) => { success: true } | { success: false; error: 'not_found' | 'tag_taken' | 'name_taken' | 'database_error' };

	verifyUnit: (unitId: number, steamid64: string) =>
		{ success: true } | { success: false; error: 'not_found' | 'invalid_transition' | 'database_error' };

	unverifyUnit: (unitId: number, steamid64: string) =>
		{ success: true } | { success: false; error: 'not_found' | 'already_unverified' | 'database_error' };

	deleteUnit: (unitId: number) =>
		{ success: true } | { success: false; error: 'not_found' | 'database_error' };

	setUnitSlots: (unitId: number, slotsAllocated: number) =>
		{ success: true } | { success: false; error: 'not_found' | 'database_error' };

	setUnitLeader: (unitId: number, userId: number) =>
		{ success: true } | { success: false; error: 'not_found' | 'not_member' | 'database_error' };

	clearUnitLeader: (unitId: number) =>
		{ success: true } | { success: false; error: 'not_found' | 'database_error' };

	setUnitAvatar: (unitId: number, data: string, mime: string) =>
		{ success: true } | { success: false; error: 'not_found' | 'database_error' };

	getUnitAvatar: (unitId: number) => { data: string; mime: string } | null;

	deleteUnitAvatar: (unitId: number) =>
		{ success: true } | { success: false; error: 'not_found' | 'database_error' };
};

export type UnitMembershipRepo = {
	listUnitMembers: (unitId: number, role?: UnitMemberRole) => UnitMembership[];
	getMembershipByUserAndUnit: (userId: number, unitId: number) => UnitMembership | null;
	getActiveMemberUnit: (userId: number) => { id: number; name: string; tag: string } | null;
	addMembership: (unitId: number, userId: number, role: UnitMemberRole, message?: string) =>
		{ success: true } | { success: false; error: 'duplicate' | 'database_error' };
	updateMembershipRole: (unitId: number, userId: number, newRole: UnitMemberRole) =>
		{ success: true } | { success: false; error: 'not_found' | 'database_error' };
	removeMembership: (unitId: number, userId: number) =>
		{ success: true } | { success: false; error: 'not_found' | 'database_error' };
	removeOtherApplications: (userId: number, exceptUnitId: number) => void;
};

export type UnitEventLog = {
	logUnitEvent: (input: {
		unitId: number;
		kind: UnitEventKind;
		actorCallsign?: string | null;
		targetCallsign?: string | null;
		meta?: string | null;
	}) => void;
	listUnitEvents: (unitId: number, limit?: number) => UnitEvent[];
};

export type UserLookup = {
	getUserBySteamId64: (steamid64: string) => {
		id: number;
		player_confirmed_at?: string | null;
	} | null;
	getUserById: (userId: number) => {
		id: number;
		player_confirmed_at?: string | null;
	} | null;
	getCallsign: (userId: number) => string | null;
};

export type UnitDeps = {
	repo: UnitRepo;
	memberships: UnitMembershipRepo;
	users: UserLookup;
	events: UnitEventLog;
};
