import { getDb } from '@/platform/db/connection';
import type {
	Rotation,
	RotationConfig,
	RotationUnitEntry,
	RotationCommanderPair,
	RotationSide,
	AvailableUnit,
} from '../domain/types';
import type { UpdateRotationConfigRequest, UpdateRotationSidesRequest, UpdateCommanderScheduleRequest } from '../domain/requests';

interface ConfigRow {
	side_a_name: string;
	side_b_name: string;
	side_a_color: string;
	side_b_color: string;
	updated_at: string | null;
}

interface UnitAssignmentRow {
	unit_id: number;
	tag: string;
	name: string;
	slots_allocated: number;
	leader_callsign: string | null;
	side: string;
	position: number;
}

interface CommanderPairRow {
	id: number;
	position: number;
	side_a_unit_id: number;
	side_a_tag: string;
	side_a_name: string;
	side_a_leader_callsign: string | null;
	side_b_unit_id: number;
	side_b_tag: string;
	side_b_name: string;
	side_b_leader_callsign: string | null;
	scheduled_date: string;
}

interface AvailableUnitRow {
	id: number;
	tag: string;
	name: string;
	slots_allocated: number;
	leader_callsign: string | null;
}

function getConfig(db: ReturnType<typeof getDb>): RotationConfig {
	const row = db.prepare(`SELECT side_a_name, side_b_name, side_a_color, side_b_color, updated_at FROM rotation_config WHERE id = 1`).get() as ConfigRow | undefined;
	if (!row) {
		return { sideAName: 'Side Alpha', sideBName: 'Side Beta', sideAColor: '#3b82f6', sideBColor: '#ef4444', updatedAt: null };
	}
	return { sideAName: row.side_a_name, sideBName: row.side_b_name, sideAColor: row.side_a_color, sideBColor: row.side_b_color, updatedAt: row.updated_at };
}

function getUnitAssignments(db: ReturnType<typeof getDb>): RotationUnitEntry[] {
	const rows = db.prepare(`
		SELECT rua.unit_id, u.tag, u.name, u.slots_allocated,
			(SELECT usr.current_callsign FROM unit_memberships lm JOIN users usr ON usr.id = lm.user_id WHERE lm.unit_id = u.id AND lm.role = 'leader' LIMIT 1) AS leader_callsign,
			rua.side, rua.position
		FROM rotation_unit_assignments rua
		JOIN units u ON u.id = rua.unit_id
		ORDER BY rua.side, rua.position
	`).all() as UnitAssignmentRow[];
	return rows.map((r) => ({
		unitId: r.unit_id,
		unitTag: r.tag,
		unitName: r.name,
		slotsAllocated: r.slots_allocated,
		leaderCallsign: r.leader_callsign,
		side: r.side as RotationSide,
		position: r.position,
	}));
}

function getCommanderSchedule(db: ReturnType<typeof getDb>): RotationCommanderPair[] {
	const rows = db.prepare(`
		SELECT
			rcs.id,
			rcs.position,
			rcs.side_a_unit_id,
			ua.tag AS side_a_tag,
			ua.name AS side_a_name,
			(SELECT usr.current_callsign FROM unit_memberships lm JOIN users usr ON usr.id = lm.user_id WHERE lm.unit_id = ua.id AND lm.role = 'leader' LIMIT 1) AS side_a_leader_callsign,
			rcs.side_b_unit_id,
			ub.tag AS side_b_tag,
			ub.name AS side_b_name,
			(SELECT usr.current_callsign FROM unit_memberships lm JOIN users usr ON usr.id = lm.user_id WHERE lm.unit_id = ub.id AND lm.role = 'leader' LIMIT 1) AS side_b_leader_callsign,
			rcs.scheduled_date
		FROM rotation_commander_schedule rcs
		JOIN units ua ON ua.id = rcs.side_a_unit_id
		JOIN units ub ON ub.id = rcs.side_b_unit_id
		ORDER BY rcs.position
	`).all() as CommanderPairRow[];
	return rows.map((r) => ({
		id: r.id,
		position: r.position,
		sideAUnitId: r.side_a_unit_id,
		sideAUnitTag: r.side_a_tag,
		sideAUnitName: r.side_a_name,
		sideALeaderCallsign: r.side_a_leader_callsign,
		sideBUnitId: r.side_b_unit_id,
		sideBUnitTag: r.side_b_tag,
		sideBUnitName: r.side_b_name,
		sideBLeaderCallsign: r.side_b_leader_callsign,
		scheduledDate: r.scheduled_date,
	}));
}

function getAvailableUnits(db: ReturnType<typeof getDb>): AvailableUnit[] {
	const rows = db.prepare(`
		SELECT u.id, u.tag, u.name, u.slots_allocated,
			(SELECT usr.current_callsign FROM unit_memberships lm JOIN users usr ON usr.id = lm.user_id WHERE lm.unit_id = u.id AND lm.role = 'leader' LIMIT 1) AS leader_callsign
		FROM units u
		WHERE u.status = 'verified' AND u.slots_allocated >= 1
			AND u.id NOT IN (SELECT unit_id FROM rotation_unit_assignments)
		ORDER BY u.tag
	`).all() as AvailableUnitRow[];
	return rows.map((r) => ({
		unitId: r.id,
		unitTag: r.tag,
		unitName: r.name,
		slotsAllocated: r.slots_allocated,
		leaderCallsign: r.leader_callsign,
	}));
}

function buildRotation(db: ReturnType<typeof getDb>): Rotation {
	const config = getConfig(db);
	const assignments = getUnitAssignments(db);
	const commanders = getCommanderSchedule(db);
	const available = getAvailableUnits(db);
	return {
		config,
		sideA: assignments.filter((a) => a.side === 'a'),
		sideB: assignments.filter((a) => a.side === 'b'),
		commanderSchedule: commanders,
		availableUnits: available,
	};
}

export function getRotation(): Rotation {
	const db = getDb();
	return buildRotation(db);
}

export function updateConfig(
	input: UpdateRotationConfigRequest & { updatedBySteamid64: string }
): { success: true; rotation: Rotation } | { success: false; error: 'database_error' } {
	const db = getDb();
	try {
		db.prepare(`
			INSERT INTO rotation_config (id, side_a_name, side_b_name, side_a_color, side_b_color, updated_at, updated_by_steamid64)
			VALUES (1, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
			ON CONFLICT(id) DO UPDATE SET
				side_a_name = excluded.side_a_name,
				side_b_name = excluded.side_b_name,
				side_a_color = excluded.side_a_color,
				side_b_color = excluded.side_b_color,
				updated_at = excluded.updated_at,
				updated_by_steamid64 = excluded.updated_by_steamid64
		`).run(input.sideAName, input.sideBName, input.sideAColor, input.sideBColor, input.updatedBySteamid64);
		return { success: true, rotation: buildRotation(db) };
	} catch {
		return { success: false, error: 'database_error' };
	}
}

export function updateSides(
	input: UpdateRotationSidesRequest & { updatedBySteamid64: string }
): { success: true; rotation: Rotation } | { success: false; error: 'invalid_unit' | 'duplicate_unit' | 'database_error' } {
	const db = getDb();

	const allUnitIds = [...input.sideA, ...input.sideB];
	const uniqueIds = new Set(allUnitIds);
	if (uniqueIds.size !== allUnitIds.length) {
		return { success: false, error: 'duplicate_unit' };
	}

	try {
		const result = db.transaction(() => {
			for (const unitId of allUnitIds) {
				const row = db.prepare(`SELECT id, status, slots_allocated FROM units WHERE id = ?`).get(unitId) as
					{ id: number; status: string; slots_allocated: number } | undefined;
				if (!row || row.status !== 'verified' || row.slots_allocated < 1) {
					return { success: false as const, error: 'invalid_unit' as const };
				}
			}

			db.prepare(`DELETE FROM rotation_unit_assignments`).run();

			const insertStmt = db.prepare(
				`INSERT INTO rotation_unit_assignments (unit_id, side, position) VALUES (?, ?, ?)`
			);
			for (let i = 0; i < input.sideA.length; i++) {
				insertStmt.run(input.sideA[i], 'a', i);
			}
			for (let i = 0; i < input.sideB.length; i++) {
				insertStmt.run(input.sideB[i], 'b', i);
			}

			db.prepare(`
				DELETE FROM rotation_commander_schedule
				WHERE side_a_unit_id NOT IN (SELECT unit_id FROM rotation_unit_assignments WHERE side = 'a')
				   OR side_b_unit_id NOT IN (SELECT unit_id FROM rotation_unit_assignments WHERE side = 'b')
			`).run();

			return null;
		})();

		if (result) return result;
		return { success: true, rotation: buildRotation(db) };
	} catch {
		return { success: false, error: 'database_error' };
	}
}

export function updateCommanderSchedule(
	input: UpdateCommanderScheduleRequest & { updatedBySteamid64: string }
): { success: true; rotation: Rotation } | { success: false; error: 'unit_not_on_side' | 'database_error' } {
	const db = getDb();

	try {
		const result = db.transaction(() => {
			for (const pair of input.pairs) {
				const sideARow = db.prepare(
					`SELECT unit_id FROM rotation_unit_assignments WHERE unit_id = ? AND side = 'a'`
				).get(pair.sideAUnitId) as { unit_id: number } | undefined;
				if (!sideARow) {
					return { success: false as const, error: 'unit_not_on_side' as const };
				}
				const sideBRow = db.prepare(
					`SELECT unit_id FROM rotation_unit_assignments WHERE unit_id = ? AND side = 'b'`
				).get(pair.sideBUnitId) as { unit_id: number } | undefined;
				if (!sideBRow) {
					return { success: false as const, error: 'unit_not_on_side' as const };
				}
			}

			db.prepare(`DELETE FROM rotation_commander_schedule`).run();

			const insertStmt = db.prepare(
				`INSERT INTO rotation_commander_schedule (position, side_a_unit_id, side_b_unit_id, scheduled_date) VALUES (?, ?, ?, ?)`
			);
			for (let i = 0; i < input.pairs.length; i++) {
				const p = input.pairs[i];
				insertStmt.run(i, p.sideAUnitId, p.sideBUnitId, p.scheduledDate);
			}

			return null;
		})();

		if (result) return result;
		return { success: true, rotation: buildRotation(db) };
	} catch {
		return { success: false, error: 'database_error' };
	}
}
