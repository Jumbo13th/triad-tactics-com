import { countUnitSlotsUsed, parseCanonicalSlotting } from '@/features/games/domain/slotting';
import type { UpdateUnitAssignmentsRequest } from '@/features/games/domain/requests';
import type {
	UpdateUnitAssignmentsRepoResult,
	ClaimUnitSlotRepoResult,
	ReleaseUnitSlotRepoResult
} from '@/features/games/ports';
import { getDb } from '@/platform/db/connection';
import {
	emitSlottingUpdated,
	findSlotById,
	getMissionParticipationUser,
	mapMissionRow,
	selectMissionColumns,
	selectMissionUnitAssignments,
	type MissionRow
} from './sqliteGamesShared';

// ── Admin: unit assignments ──────────────────────────────────────────

export function updateUnitAssignments(
	input: UpdateUnitAssignmentsRequest & { missionId: number; updatedBySteamId64: string }
): UpdateUnitAssignmentsRepoResult {
	const db = getDb();
	const selectMission = db.prepare(`
		SELECT ${selectMissionColumns()}
		FROM missions
		WHERE id = ?
		LIMIT 1
	`);
	const deleteAssignments = db.prepare(`
		DELETE FROM mission_unit_assignments WHERE mission_id = ?
	`);
	const insertAssignment = db.prepare(`
		INSERT INTO mission_unit_assignments (mission_id, unit_id, side_id, assigned_by_steamid64)
		VALUES (?, ?, ?, ?)
	`);
	const insertAudit = db.prepare(`
		INSERT INTO mission_audit_events (mission_id, actor_steamid64, event_type, payload)
		VALUES (?, ?, 'mission.unit_assignments.updated', ?)
	`);

	try {
		const run = db.transaction((): UpdateUnitAssignmentsRepoResult => {
			const row = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!row) {
				return { success: false, error: 'not_found' };
			}

			const slotting = parseCanonicalSlotting(row.slotting_json);
			const validSideIds = new Set(slotting.sides.map((side) => side.id));
			for (const assignment of input.assignments) {
				if (!validSideIds.has(assignment.sideId)) {
					return { success: false, error: 'invalid_side_id' };
				}
				const unit = db.prepare(`
					SELECT id, status, slots_allocated FROM units WHERE id = ? LIMIT 1
				`).get(assignment.unitId) as { id: number; status: string; slots_allocated: number } | undefined;
				if (!unit || unit.status !== 'verified' || unit.slots_allocated < 1) {
					return { success: false, error: 'invalid_unit' };
				}
			}

			const before = selectMissionUnitAssignments(db, input.missionId);
			deleteAssignments.run(input.missionId);
			for (const assignment of input.assignments) {
				insertAssignment.run(input.missionId, assignment.unitId, assignment.sideId, input.updatedBySteamId64);
			}
			const after = selectMissionUnitAssignments(db, input.missionId);

			insertAudit.run(
				input.missionId,
				input.updatedBySteamId64,
				JSON.stringify({ before, after })
			);

			const updated = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!updated) {
				return { success: false, error: 'database_error' };
			}
			return { success: true, mission: mapMissionRow(db, updated) };
		});

		return run();
	} catch {
		return { success: false, error: 'database_error' };
	}
}

// ── Unit leader: claim slot ──────────────────────────────────────────

export function claimUnitSlot(input: {
	shortCode: string;
	slotId: string;
	steamId64: string;
}): ClaimUnitSlotRepoResult {
	const db = getDb();
	const selectMission = db.prepare(`
		SELECT ${selectMissionColumns()}
		FROM missions
		WHERE status = 'published' AND short_code IS NOT NULL AND LOWER(short_code) = LOWER(?)
		LIMIT 1
	`);
	const updateMissionSlotting = db.prepare(`
		UPDATE missions
		SET slotting_json = ?,
			slotting_revision = slotting_revision + 1,
			updated_at = CURRENT_TIMESTAMP,
			updated_by_steamid64 = ?
		WHERE id = ? AND slotting_revision = ?
	`);
	const insertAudit = db.prepare(`
		INSERT INTO mission_audit_events (mission_id, actor_user_id, actor_steamid64, event_type, payload)
		VALUES (?, ?, ?, 'mission.unit_slot.claimed', ?)
	`);

	try {
		const run = db.transaction((): ClaimUnitSlotRepoResult => {
			const row = selectMission.get(input.shortCode) as MissionRow | undefined;
			if (!row) {
				return { success: false, error: 'mission_not_found' };
			}

			if (row.unit_slotting_manual_state !== 'open') {
				return { success: false, error: 'unit_slotting_closed' };
			}

			const user = getMissionParticipationUser(db, input.steamId64);
			if (!user) {
				return { success: false, error: 'database_error' };
			}

			const unitRow = db.prepare(`
				SELECT u.id AS unit_id, u.tag, u.leader_user_id, u.slots_allocated
				FROM unit_memberships um
				JOIN units u ON u.id = um.unit_id
				WHERE um.user_id = ? AND um.role = 'member'
				LIMIT 1
			`).get(user.id) as { unit_id: number; tag: string; leader_user_id: number | null; slots_allocated: number } | undefined;

			if (!unitRow || unitRow.leader_user_id !== user.id) {
				return { success: false, error: 'not_unit_leader' };
			}

			const assignment = db.prepare(`
				SELECT side_id FROM mission_unit_assignments
				WHERE mission_id = ? AND unit_id = ?
			`).get(row.id, unitRow.unit_id) as { side_id: string } | undefined;

			if (!assignment) {
				return { success: false, error: 'unit_not_assigned' };
			}

			const slotting = parseCanonicalSlotting(row.slotting_json);
			const slotContext = findSlotById(slotting, input.slotId);
			if (!slotContext || slotContext.slot.access !== 'unit') {
				return { success: false, error: 'slot_not_found' };
			}

			if (slotContext.side.id !== assignment.side_id) {
				return { success: false, error: 'wrong_side' };
			}

			if (slotContext.slot.occupant !== null) {
				return { success: false, error: 'slot_taken' };
			}

			const slotsUsed = countUnitSlotsUsed(slotting, unitRow.tag);
			if (slotsUsed >= unitRow.slots_allocated) {
				return { success: false, error: 'slots_exhausted' };
			}

			slotContext.slot.occupant = { type: 'placeholder', label: unitRow.tag };

			const updatedInfo = updateMissionSlotting.run(
				JSON.stringify(slotting),
				input.steamId64,
				row.id,
				row.slotting_revision
			);

			if (updatedInfo.changes === 0) {
				return { success: false, error: 'claim_conflict' };
			}

			insertAudit.run(
				row.id,
				user.id,
				input.steamId64,
				JSON.stringify({ slotId: input.slotId, unitTag: unitRow.tag, shortCode: row.short_code ?? null })
			);

			return { success: true };
		});

		const result = run();
		if (result.success) {
			// Emit after transaction commits so SSE subscribers read committed data
			const fresh = selectMission.get(input.shortCode) as MissionRow | undefined;
			if (fresh) emitSlottingUpdated(fresh.short_code, fresh.slotting_revision);
		}
		return result;
	} catch {
		return { success: false, error: 'database_error' };
	}
}

// ── Unit leader: release slot ────────────────────────────────────────

export function releaseUnitSlot(input: {
	shortCode: string;
	slotId: string;
	steamId64: string;
}): ReleaseUnitSlotRepoResult {
	const db = getDb();
	const selectMission = db.prepare(`
		SELECT ${selectMissionColumns()}
		FROM missions
		WHERE status = 'published' AND short_code IS NOT NULL AND LOWER(short_code) = LOWER(?)
		LIMIT 1
	`);
	const updateMissionSlotting = db.prepare(`
		UPDATE missions
		SET slotting_json = ?,
			slotting_revision = slotting_revision + 1,
			updated_at = CURRENT_TIMESTAMP,
			updated_by_steamid64 = ?
		WHERE id = ? AND slotting_revision = ?
	`);
	const insertAudit = db.prepare(`
		INSERT INTO mission_audit_events (mission_id, actor_user_id, actor_steamid64, event_type, payload)
		VALUES (?, ?, ?, 'mission.unit_slot.released', ?)
	`);

	try {
		const run = db.transaction((): ReleaseUnitSlotRepoResult => {
			const row = selectMission.get(input.shortCode) as MissionRow | undefined;
			if (!row) {
				return { success: false, error: 'mission_not_found' };
			}

			if (row.unit_slotting_manual_state !== 'open') {
				return { success: false, error: 'unit_slotting_closed' };
			}

			const user = getMissionParticipationUser(db, input.steamId64);
			if (!user) {
				return { success: false, error: 'database_error' };
			}

			const unitRow = db.prepare(`
				SELECT u.id AS unit_id, u.tag, u.leader_user_id
				FROM unit_memberships um
				JOIN units u ON u.id = um.unit_id
				WHERE um.user_id = ? AND um.role = 'member'
				LIMIT 1
			`).get(user.id) as { unit_id: number; tag: string; leader_user_id: number | null } | undefined;

			if (!unitRow || unitRow.leader_user_id !== user.id) {
				return { success: false, error: 'not_unit_leader' };
			}

			const slotting = parseCanonicalSlotting(row.slotting_json);
			const slotContext = findSlotById(slotting, input.slotId);
			if (!slotContext || slotContext.slot.access !== 'unit') {
				return { success: false, error: 'slot_not_found' };
			}

			if (
				slotContext.slot.occupant?.type !== 'placeholder' ||
				slotContext.slot.occupant.label.toLowerCase() !== unitRow.tag.toLowerCase()
			) {
				return { success: false, error: 'not_your_unit_slot' };
			}

			slotContext.slot.occupant = null;

			const updatedInfo = updateMissionSlotting.run(
				JSON.stringify(slotting),
				input.steamId64,
				row.id,
				row.slotting_revision
			);

			if (updatedInfo.changes === 0) {
				return { success: false, error: 'release_conflict' };
			}

			insertAudit.run(
				row.id,
				user.id,
				input.steamId64,
				JSON.stringify({ slotId: input.slotId, unitTag: unitRow.tag, shortCode: row.short_code ?? null })
			);

			return { success: true };
		});

		const result = run();
		if (result.success) {
			const fresh = selectMission.get(input.shortCode) as MissionRow | undefined;
			if (fresh) emitSlottingUpdated(fresh.short_code, fresh.slotting_revision);
		}
		return result;
	} catch {
		return { success: false, error: 'database_error' };
	}
}
