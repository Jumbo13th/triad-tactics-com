import { getDb } from '@/platform/db/connection';
import type { Unit, UnitEvent, UnitEventKind, UnitMembership, UnitMemberRole, UnitStatus, UnitSummary } from '@/features/units/domain/types';

interface UnitRow {
	id: number;
	name: string;
	tag: string;
	description: string;
	status: string;
	avatar_mime: string | null;
	leader_user_id: number | null;
	leader_callsign: string | null;
	slots_allocated: number;
	member_names: string;
	history: string;
	other_projects: string;
	join_message: string;
	created_by_user_id: number;
	verified_at: string | null;
	verified_by_steamid64: string | null;
	unverified_at: string | null;
	unverified_by_steamid64: string | null;
	created_at: string;
	updated_at: string;
	member_count: number;
	applicant_count: number;
}

function mapUnitRow(row: UnitRow): Unit {
	return {
		id: row.id,
		name: row.name,
		tag: row.tag,
		description: row.description,
		status: row.status as UnitStatus,
		avatarMime: row.avatar_mime,
		leaderUserId: row.leader_user_id,
		leaderCallsign: row.leader_callsign,
		slotsAllocated: row.slots_allocated,
		memberNames: row.member_names,
		history: row.history,
		otherProjects: row.other_projects,
		joinMessage: row.join_message,
		createdByUserId: row.created_by_user_id,
		verifiedAt: row.verified_at,
		verifiedBySteamid64: row.verified_by_steamid64,
		unverifiedAt: row.unverified_at,
		unverifiedBySteamid64: row.unverified_by_steamid64,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		memberCount: row.member_count,
		applicantCount: row.applicant_count
	};
}

interface MembershipRow {
	id: number;
	unit_id: number;
	user_id: number;
	callsign: string | null;
	steamid64: string | null;
	role: string;
	message: string;
	created_at: string;
}

function mapMembershipRow(row: MembershipRow): UnitMembership {
	return {
		id: row.id,
		unitId: row.unit_id,
		userId: row.user_id,
		callsign: row.callsign,
		steamid64: row.steamid64,
		message: row.message,
		role: row.role as UnitMemberRole,
		createdAt: row.created_at
	};
}

const UNIT_SELECT = `
	SELECT
		u.id, u.name, u.tag, u.description, u.status,
		u.avatar_mime, u.leader_user_id, u.slots_allocated,
		u.member_names, u.history, u.other_projects, u.join_message,
		u.created_by_user_id, u.verified_at, u.verified_by_steamid64,
		u.unverified_at, u.unverified_by_steamid64, u.created_at, u.updated_at,
		lu.current_callsign AS leader_callsign,
		(SELECT COUNT(*) FROM unit_memberships m WHERE m.unit_id = u.id AND m.role IN ('member', 'deputy')) AS member_count,
		(SELECT COUNT(*) FROM unit_memberships m WHERE m.unit_id = u.id AND m.role = 'applicant') AS applicant_count
	FROM units u
	LEFT JOIN users lu ON lu.id = u.leader_user_id
`;

const MEMBERSHIP_SELECT = `
	SELECT
		um.id, um.unit_id, um.user_id, um.role, um.message, um.created_at,
		usr.current_callsign AS callsign,
		ui.provider_user_id AS steamid64
	FROM unit_memberships um
	JOIN users usr ON usr.id = um.user_id
	LEFT JOIN user_identities ui ON ui.user_id = um.user_id AND ui.provider = 'steam'
`;

export function createUnit(input: {
	name: string;
	tag: string;
	description: string;
	memberNames: string;
	history: string;
	otherProjects: string;
	creatorUserId: number;
}): { success: true; unitId: number } | { success: false; error: 'tag_taken' | 'name_taken' | 'database_error' } {
	const db = getDb();
	try {
		const result = db.transaction(() => {
			const insert = db.prepare(`
				INSERT INTO units (name, tag, description, member_names, history, other_projects, status, leader_user_id, created_by_user_id)
				VALUES (?, ?, ?, ?, ?, ?, 'unverified', ?, ?)
			`).run(input.name, input.tag, input.description, input.memberNames, input.history, input.otherProjects, input.creatorUserId, input.creatorUserId);

			const unitId = Number(insert.lastInsertRowid);

			db.prepare(`
				INSERT INTO unit_memberships (unit_id, user_id, role)
				VALUES (?, ?, 'member')
			`).run(unitId, input.creatorUserId);

			return unitId;
		})();
		return { success: true, unitId: result };
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : '';
		if (msg.includes('idx_units_tag_unique')) return { success: false, error: 'tag_taken' };
		if (msg.includes('idx_units_name_unique')) return { success: false, error: 'name_taken' };
		return { success: false, error: 'database_error' };
	}
}

export function getUnitById(unitId: number): Unit | null {
	const db = getDb();
	const row = db.prepare(`${UNIT_SELECT} WHERE u.id = ?`).get(unitId) as UnitRow | undefined;
	return row ? mapUnitRow(row) : null;
}

export function getUnitIdByTag(tag: string): number | null {
	const db = getDb();
	const row = db.prepare('SELECT id FROM units WHERE LOWER(tag) = LOWER(?)').get(tag) as { id: number } | undefined;
	return row?.id ?? null;
}

export function listUnits(input: {
	status?: UnitStatus;
	query?: string;
	hasSlots?: boolean;
	page?: number;
	pageSize?: number;
}): UnitSummary[] {
	const db = getDb();
	const clauses: string[] = [];
	const params: unknown[] = [];

	if (input.status) {
		clauses.push('u.status = ?');
		params.push(input.status);
	}

	if (input.hasSlots === true) {
		clauses.push('u.slots_allocated > 0');
	} else if (input.hasSlots === false) {
		clauses.push('u.slots_allocated = 0');
	}

	const needle = input.query?.trim().toLowerCase();
	if (needle) {
		const like = `%${needle}%`;
		clauses.push(`(LOWER(u.name) LIKE ? OR LOWER(u.tag) LIKE ? OR LOWER(COALESCE(lu.current_callsign, '')) LIKE ?)`);
		params.push(like, like, like);
	}

	const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
	const page = input.page ?? 1;
	const pageSize = input.pageSize ?? 50;
	const offset = (page - 1) * pageSize;

	const rows = db.prepare(`
		SELECT
			u.id, u.name, u.tag, u.description, u.status,
			u.avatar_mime, u.slots_allocated, u.updated_at,
			lu.current_callsign AS leader_callsign,
			(SELECT COUNT(*) FROM unit_memberships m WHERE m.unit_id = u.id AND m.role IN ('member', 'deputy')) AS member_count
		FROM units u
		LEFT JOIN users lu ON lu.id = u.leader_user_id
		${where}
		ORDER BY (CASE WHEN u.slots_allocated > 0 THEN 0 ELSE 1 END) ASC, u.created_at ASC
		LIMIT ? OFFSET ?
	`).all(...params, pageSize, offset) as Array<{
		id: number;
		name: string;
		tag: string;
		description: string;
		status: string;
		avatar_mime: string | null;
		slots_allocated: number;
		updated_at: string;
		leader_callsign: string | null;
		member_count: number;
	}>;

	return rows.map(r => ({
		id: r.id,
		name: r.name,
		tag: r.tag,
		description: r.description,
		status: r.status as UnitStatus,
		leaderCallsign: r.leader_callsign,
		memberCount: r.member_count,
		slotsAllocated: r.slots_allocated,
		updatedAt: r.updated_at,
		hasAvatar: !!r.avatar_mime
	}));
}

export function countUnits(input: { status?: UnitStatus; query?: string; hasSlots?: boolean }): number {
	const db = getDb();
	const clauses: string[] = [];
	const params: unknown[] = [];

	if (input.status) {
		clauses.push('u.status = ?');
		params.push(input.status);
	}

	if (input.hasSlots === true) {
		clauses.push('u.slots_allocated > 0');
	} else if (input.hasSlots === false) {
		clauses.push('u.slots_allocated = 0');
	}

	const needle = input.query?.trim().toLowerCase();
	if (needle) {
		const like = `%${needle}%`;
		clauses.push(`(LOWER(u.name) LIKE ? OR LOWER(u.tag) LIKE ? OR LOWER(COALESCE(lu.current_callsign, '')) LIKE ?)`);
		params.push(like, like, like);
	}

	const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
	const row = db.prepare(`
		SELECT COUNT(*) AS cnt
		FROM units u
		LEFT JOIN users lu ON lu.id = u.leader_user_id
		${where}
	`).get(...params) as { cnt: number };
	return row.cnt;
}

export function updateUnit(
	unitId: number,
	input: { name?: string; tag?: string; description?: string; joinMessage?: string }
): { success: true } | { success: false; error: 'not_found' | 'tag_taken' | 'name_taken' | 'database_error' } {
	const db = getDb();
	const sets: string[] = [];
	const params: unknown[] = [];

	if (input.name !== undefined) { sets.push('name = ?'); params.push(input.name); }
	if (input.tag !== undefined) { sets.push('tag = ?'); params.push(input.tag); }
	if (input.description !== undefined) { sets.push('description = ?'); params.push(input.description); }
	if (input.joinMessage !== undefined) { sets.push('join_message = ?'); params.push(input.joinMessage); }

	if (sets.length === 0) return { success: true };
	sets.push('updated_at = CURRENT_TIMESTAMP');
	params.push(unitId);

	try {
		const result = db.prepare(`UPDATE units SET ${sets.join(', ')} WHERE id = ?`).run(...params);
		if (result.changes === 0) return { success: false, error: 'not_found' };
		return { success: true };
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : '';
		if (msg.includes('idx_units_tag_unique')) return { success: false, error: 'tag_taken' };
		if (msg.includes('idx_units_name_unique')) return { success: false, error: 'name_taken' };
		return { success: false, error: 'database_error' };
	}
}

export function verifyUnit(
	unitId: number,
	steamid64: string
): { success: true } | { success: false; error: 'not_found' | 'invalid_transition' | 'database_error' } {
	const db = getDb();
	try {
		const result = db.prepare(`
			UPDATE units
			SET status = 'verified', verified_at = CURRENT_TIMESTAMP, verified_by_steamid64 = ?, updated_at = CURRENT_TIMESTAMP
			WHERE id = ? AND status = 'unverified'
		`).run(steamid64, unitId);
		if (result.changes === 0) {
			const existing = db.prepare('SELECT status FROM units WHERE id = ?').get(unitId) as { status: string } | undefined;
			if (!existing) return { success: false, error: 'not_found' };
			return { success: false, error: 'invalid_transition' };
		}
		return { success: true };
	} catch {
		return { success: false, error: 'database_error' };
	}
}

export function unverifyUnit(
	unitId: number,
	steamid64: string
): { success: true } | { success: false; error: 'not_found' | 'already_unverified' | 'database_error' } {
	const db = getDb();
	try {
		const result = db.prepare(`
			UPDATE units
			SET status = 'unverified', unverified_at = CURRENT_TIMESTAMP, unverified_by_steamid64 = ?,
			    verified_at = NULL, verified_by_steamid64 = NULL, updated_at = CURRENT_TIMESTAMP
			WHERE id = ? AND status = 'verified'
		`).run(steamid64, unitId);
		if (result.changes === 0) {
			const existing = db.prepare('SELECT status FROM units WHERE id = ?').get(unitId) as { status: string } | undefined;
			if (!existing) return { success: false, error: 'not_found' };
			return { success: false, error: 'already_unverified' };
		}
		return { success: true };
	} catch {
		return { success: false, error: 'database_error' };
	}
}

export function deleteUnit(
	unitId: number
): { success: true } | { success: false; error: 'not_found' | 'database_error' } {
	const db = getDb();
	try {
		db.transaction(() => {
			db.prepare('DELETE FROM unit_memberships WHERE unit_id = ?').run(unitId);
			const result = db.prepare('DELETE FROM units WHERE id = ?').run(unitId);
			if (result.changes === 0) throw new Error('not_found');
		})();
		return { success: true };
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : '';
		if (msg === 'not_found') return { success: false, error: 'not_found' };
		return { success: false, error: 'database_error' };
	}
}

export function setUnitSlots(
	unitId: number,
	slotsAllocated: number
): { success: true } | { success: false; error: 'not_found' | 'database_error' } {
	const db = getDb();
	try {
		const result = db.prepare(`
			UPDATE units SET slots_allocated = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
		`).run(slotsAllocated, unitId);
		if (result.changes === 0) return { success: false, error: 'not_found' };
		return { success: true };
	} catch {
		return { success: false, error: 'database_error' };
	}
}

export function setUnitLeader(
	unitId: number,
	userId: number
): { success: true } | { success: false; error: 'not_found' | 'not_member' | 'database_error' } {
	const db = getDb();
	try {
		const membership = db.prepare(
			`SELECT id FROM unit_memberships WHERE unit_id = ? AND user_id = ? AND role IN ('member', 'deputy')`
		).get(unitId, userId);
		if (!membership) return { success: false, error: 'not_member' };

		const result = db.prepare(`
			UPDATE units SET leader_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
		`).run(userId, unitId);
		if (result.changes === 0) return { success: false, error: 'not_found' };
		return { success: true };
	} catch {
		return { success: false, error: 'database_error' };
	}
}

export function clearUnitLeader(
	unitId: number
): { success: true } | { success: false; error: 'not_found' | 'database_error' } {
	const db = getDb();
	try {
		const result = db.prepare(`
			UPDATE units SET leader_user_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
		`).run(unitId);
		if (result.changes === 0) return { success: false, error: 'not_found' };
		return { success: true };
	} catch {
		return { success: false, error: 'database_error' };
	}
}

export function setUnitAvatar(
	unitId: number,
	data: string,
	mime: string
): { success: true } | { success: false; error: 'not_found' | 'database_error' } {
	const db = getDb();
	try {
		const result = db.prepare(`
			UPDATE units
			SET avatar_data = ?, avatar_mime = ?, updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
			WHERE id = ?
		`).run(data, mime, unitId);
		if (result.changes === 0) return { success: false, error: 'not_found' };
		return { success: true };
	} catch {
		return { success: false, error: 'database_error' };
	}
}

export function getUnitAvatar(unitId: number): { data: string; mime: string } | null {
	const db = getDb();
	const row = db.prepare('SELECT avatar_data, avatar_mime FROM units WHERE id = ? AND avatar_data IS NOT NULL').get(unitId) as
		{ avatar_data: string; avatar_mime: string } | undefined;
	return row ? { data: row.avatar_data, mime: row.avatar_mime } : null;
}

export function deleteUnitAvatar(unitId: number): { success: true } | { success: false; error: 'not_found' | 'database_error' } {
	const db = getDb();
	try {
		const result = db.prepare(`
			UPDATE units
			SET avatar_data = NULL, avatar_mime = NULL, updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
			WHERE id = ?
		`).run(unitId);
		if (result.changes === 0) return { success: false, error: 'not_found' };
		return { success: true };
	} catch {
		return { success: false, error: 'database_error' };
	}
}

export function listUnitMembers(unitId: number, role?: UnitMemberRole): UnitMembership[] {
	const db = getDb();
	const roleFilter = role ? 'AND um.role = ?' : '';
	const params: unknown[] = role ? [unitId, role] : [unitId];
	const rows = db.prepare(`
		${MEMBERSHIP_SELECT}
		WHERE um.unit_id = ? ${roleFilter}
		ORDER BY um.role ASC, um.created_at ASC
	`).all(...params) as MembershipRow[];
	return rows.map(mapMembershipRow);
}

export function getMembershipByUserAndUnit(userId: number, unitId: number): UnitMembership | null {
	const db = getDb();
	const row = db.prepare(`
		${MEMBERSHIP_SELECT}
		WHERE um.user_id = ? AND um.unit_id = ?
	`).get(userId, unitId) as MembershipRow | undefined;
	return row ? mapMembershipRow(row) : null;
}

export function getActiveMemberUnit(userId: number): { id: number; name: string; tag: string } | null {
	const db = getDb();
	const row = db.prepare(`
		SELECT u.id, u.name, u.tag
		FROM unit_memberships um
		JOIN units u ON u.id = um.unit_id
		WHERE um.user_id = ? AND um.role IN ('member', 'deputy')
	`).get(userId) as { id: number; name: string; tag: string } | undefined;
	return row ?? null;
}

export function addMembership(
	unitId: number,
	userId: number,
	role: UnitMemberRole,
	message = ''
): { success: true } | { success: false; error: 'duplicate' | 'database_error' } {
	const db = getDb();
	try {
		db.prepare(`
			INSERT INTO unit_memberships (unit_id, user_id, role, message)
			VALUES (?, ?, ?, ?)
		`).run(unitId, userId, role, message);
		return { success: true };
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : '';
		if (msg.includes('UNIQUE constraint')) return { success: false, error: 'duplicate' };
		return { success: false, error: 'database_error' };
	}
}

export function updateMembershipRole(
	unitId: number,
	userId: number,
	newRole: UnitMemberRole
): { success: true } | { success: false; error: 'not_found' | 'database_error' } {
	const db = getDb();
	try {
		const result = db.prepare(`
			UPDATE unit_memberships SET role = ?, updated_at = CURRENT_TIMESTAMP
			WHERE unit_id = ? AND user_id = ?
		`).run(newRole, unitId, userId);
		if (result.changes === 0) return { success: false, error: 'not_found' };
		return { success: true };
	} catch {
		return { success: false, error: 'database_error' };
	}
}

export function removeMembership(
	unitId: number,
	userId: number
): { success: true } | { success: false; error: 'not_found' | 'database_error' } {
	const db = getDb();
	try {
		const result = db.prepare(`
			DELETE FROM unit_memberships WHERE unit_id = ? AND user_id = ?
		`).run(unitId, userId);
		if (result.changes === 0) return { success: false, error: 'not_found' };
		return { success: true };
	} catch {
		return { success: false, error: 'database_error' };
	}
}

export function removeOtherApplications(userId: number, exceptUnitId: number): void {
	const db = getDb();
	try {
		db.prepare(`
			DELETE FROM unit_memberships WHERE user_id = ? AND role = 'applicant' AND unit_id != ?
		`).run(userId, exceptUnitId);
	} catch {
	}
}

export function logUnitEvent(input: {
	unitId: number;
	kind: UnitEventKind;
	actorCallsign?: string | null;
	targetCallsign?: string | null;
	meta?: string | null;
}): void {
	const db = getDb();
	try {
		db.prepare(`
			INSERT INTO unit_events (unit_id, kind, actor_callsign, target_callsign, meta)
			VALUES (?, ?, ?, ?, ?)
		`).run(input.unitId, input.kind, input.actorCallsign ?? null, input.targetCallsign ?? null, input.meta ?? null);
	} catch {
	}
}

export function listUnitEvents(unitId: number, limit = 50): UnitEvent[] {
	const db = getDb();
	const rows = db.prepare(`
		SELECT id, unit_id, kind, actor_callsign, target_callsign, meta, created_at
		FROM unit_events
		WHERE unit_id = ?
		ORDER BY created_at DESC
		LIMIT ?
	`).all(unitId, limit) as Array<{
		id: number;
		unit_id: number;
		kind: string;
		actor_callsign: string | null;
		target_callsign: string | null;
		meta: string | null;
		created_at: string;
	}>;
	return rows.map(r => ({
		id: r.id,
		unitId: r.unit_id,
		kind: r.kind as UnitEventKind,
		actorCallsign: r.actor_callsign,
		targetCallsign: r.target_callsign,
		meta: r.meta,
		createdAt: r.created_at
	}));
}
