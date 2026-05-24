export type UnitStatus = 'unverified' | 'verified';
export type UnitMemberRole = 'member' | 'applicant' | 'deputy' | 'leader';

export interface Unit {
	id: number;
	name: string;
	tag: string;
	description: string;
	status: UnitStatus;
	avatarMime: string | null;
	leaderCallsign: string | null;
	slotsAllocated: number;
	memberNames: string;
	history: string;
	otherProjects: string;
	joinMessage: string;
	createdByUserId: number;
	verifiedAt: string | null;
	verifiedBySteamid64: string | null;
	unverifiedAt: string | null;
	unverifiedBySteamid64: string | null;
	createdAt: string;
	updatedAt: string;
	memberCount: number;
	applicantCount: number;
}

export interface UnitSummary {
	id: number;
	name: string;
	tag: string;
	description: string;
	status: UnitStatus;
	leaderCallsign: string | null;
	memberCount: number;
	slotsAllocated: number;
	updatedAt: string;
	hasAvatar: boolean;
}

export interface UnitMembership {
	id: number;
	unitId: number;
	userId: number;
	callsign: string | null;
	steamid64: string | null;
	role: UnitMemberRole;
	message: string;
	createdAt: string;
}

export type UnitEventKind =
	| 'created'
	| 'verified'
	| 'unverified'
	| 'member_applied'
	| 'member_joined'
	| 'member_left'
	| 'member_removed'
	| 'member_approved'
	| 'applicant_rejected'
	| 'application_withdrawn'
	| 'leader_changed'
	| 'slots_changed'
	| 'deputy_promoted'
	| 'deputy_demoted';

export interface UnitEvent {
	id: number;
	unitId: number;
	kind: UnitEventKind;
	actorCallsign: string | null;
	targetCallsign: string | null;
	meta: string | null;
	createdAt: string;
}

export interface UnitViewerContext {
	isMember: boolean;
	isApplicant: boolean;
	isLeader: boolean;
	isDeputy: boolean;
	isAdmin: boolean;
	hasUnitElsewhere: boolean;
	membership: UnitMembership | null;
}
