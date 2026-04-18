import type { UnitDeps } from './ports';
import {
	createUnit,
	getUnitById,
	listUnits,
	countUnits,
	updateUnit,
	verifyUnit,
	unverifyUnit,
	deleteUnit,
	setUnitSlots,
	setUnitLeader,
	setUnitAvatar,
	getUnitAvatar,
	deleteUnitAvatar,
	listUnitMembers,
	getMembershipByUserAndUnit,
	getActiveMemberUnit,
	addMembership,
	updateMembershipRole,
	removeMembership,
	removeOtherApplications,
	logUnitEvent,
	listUnitEvents
} from './infra/sqliteUnits';
import { getUserBySteamId64 } from '@/features/users/infra/sqliteUsers';
import { getDb } from '@/platform/db/connection';

function getUserById(userId: number) {
	const db = getDb();
	const row = db.prepare('SELECT id, player_confirmed_at FROM users WHERE id = ?').get(userId) as
		{ id: number; player_confirmed_at: string | null } | undefined;
	return row ?? null;
}

export const unitDeps: UnitDeps = {
	repo: {
		createUnit,
		getUnitById,
		listUnits,
		countUnits,
		updateUnit,
		verifyUnit,
		unverifyUnit,
		deleteUnit,
		setUnitSlots,
		setUnitLeader,
		setUnitAvatar,
		getUnitAvatar,
		deleteUnitAvatar
	},
	memberships: {
		listUnitMembers,
		getMembershipByUserAndUnit,
		getActiveMemberUnit,
		addMembership,
		updateMembershipRole,
		removeMembership,
		removeOtherApplications
	},
	users: {
		getUserBySteamId64,
		getUserById,
		getCallsign: (userId: number) => {
			const db = getDb();
			const row = db.prepare('SELECT current_callsign FROM users WHERE id = ?').get(userId) as
				{ current_callsign: string | null } | undefined;
			return row?.current_callsign ?? null;
		}
	},
	events: {
		logUnitEvent,
		listUnitEvents
	}
};
