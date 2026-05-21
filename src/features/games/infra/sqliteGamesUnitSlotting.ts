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
	selectEpisodeSlotting,
	selectMissionColumns,
	selectMissionUnitAssignments,
	syncMissionsTableForEp1,
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
		DELETE FROM mission_unit_assignments WHERE mission_id = ? AND episode_number = ?
	`);
	const insertAssignment = db.prepare(`
		INSERT INTO mission_unit_assignments (mission_id, unit_id, side_id, episode_number, assigned_by_steamid64)
		VALUES (?, ?, ?, ?, ?)
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

			const episode = selectEpisodeSlotting(db, input.missionId, input.episodeNumber);
			const slotting = episode ? episode.slotting : parseCanonicalSlotting(row.slotting_json);
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

			const before = selectMissionUnitAssignments(db, input.missionId, input.episodeNumber);
			deleteAssignments.run(input.missionId, input.episodeNumber);
			for (const assignment of input.assignments) {
				insertAssignment.run(input.missionId, assignment.unitId, assignment.sideId, input.episodeNumber, input.updatedBySteamId64);
			}
			const after = selectMissionUnitAssignments(db, input.missionId, input.episodeNumber);

			insertAudit.run(
				input.missionId,
				input.updatedBySteamId64,
				JSON.stringify({ episodeNumber: input.episodeNumber, before, after })
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
	episodeNumber: number;
}): ClaimUnitSlotRepoResult {
	const db = getDb();
	const selectMission = db.prepare(`
		SELECT ${selectMissionColumns()}
		FROM missions
		WHERE status = 'published' AND short_code IS NOT NULL AND LOWER(short_code) = LOWER(?)
		LIMIT 1
	`);
	const updateEpisodeSlotting = db.prepare(`
		UPDATE mission_episode_slotting
		SET slotting_json = ?,
			slotting_revision = slotting_revision + 1
		WHERE mission_id = ? AND episode_number = ? AND slotting_revision = ?
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
				WHERE mission_id = ? AND unit_id = ? AND episode_number = ?
			`).get(row.id, unitRow.unit_id, input.episodeNumber) as { side_id: string } | undefined;

			if (!assignment) {
				return { success: false, error: 'unit_not_assigned' };
			}

			const episode = selectEpisodeSlotting(db, row.id, input.episodeNumber);
			if (!episode) {
				return { success: false, error: 'slot_not_found' };
			}

			const slotting = episode.slotting;
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

			const updatedSlottingJson = JSON.stringify(slotting);
			const updatedInfo = updateEpisodeSlotting.run(
				updatedSlottingJson,
				row.id,
				input.episodeNumber,
				episode.slottingRevision
			);

			if (updatedInfo.changes === 0) {
				return { success: false, error: 'claim_conflict' };
			}

			syncMissionsTableForEp1(db, row.id, input.episodeNumber, updatedSlottingJson, input.steamId64);

			insertAudit.run(
				row.id,
				user.id,
				input.steamId64,
				JSON.stringify({ slotId: input.slotId, episodeNumber: input.episodeNumber, unitTag: unitRow.tag, shortCode: row.short_code ?? null })
			);

			return { success: true };
		});

		const result = run();
		if (result.success) {
			const fresh = selectMission.get(input.shortCode) as MissionRow | undefined;
			const freshEpisode = fresh ? selectEpisodeSlotting(db, fresh.id, input.episodeNumber) : null;
			if (fresh) emitSlottingUpdated(fresh.short_code, freshEpisode?.slottingRevision ?? fresh.slotting_revision, input.episodeNumber);
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
	episodeNumber: number;
}): ReleaseUnitSlotRepoResult {
	const db = getDb();
	const selectMission = db.prepare(`
		SELECT ${selectMissionColumns()}
		FROM missions
		WHERE status = 'published' AND short_code IS NOT NULL AND LOWER(short_code) = LOWER(?)
		LIMIT 1
	`);
	const updateEpisodeSlotting = db.prepare(`
		UPDATE mission_episode_slotting
		SET slotting_json = ?,
			slotting_revision = slotting_revision + 1
		WHERE mission_id = ? AND episode_number = ? AND slotting_revision = ?
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

			const episode = selectEpisodeSlotting(db, row.id, input.episodeNumber);
			if (!episode) {
				return { success: false, error: 'slot_not_found' };
			}

			const slotting = episode.slotting;
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

			const updatedSlottingJson = JSON.stringify(slotting);
			const updatedInfo = updateEpisodeSlotting.run(
				updatedSlottingJson,
				row.id,
				input.episodeNumber,
				episode.slottingRevision
			);

			if (updatedInfo.changes === 0) {
				return { success: false, error: 'release_conflict' };
			}

			syncMissionsTableForEp1(db, row.id, input.episodeNumber, updatedSlottingJson, input.steamId64);

			insertAudit.run(
				row.id,
				user.id,
				input.steamId64,
				JSON.stringify({ slotId: input.slotId, episodeNumber: input.episodeNumber, unitTag: unitRow.tag, shortCode: row.short_code ?? null })
			);

			return { success: true };
		});

		const result = run();
		if (result.success) {
			const fresh = selectMission.get(input.shortCode) as MissionRow | undefined;
			const freshEpisode = fresh ? selectEpisodeSlotting(db, fresh.id, input.episodeNumber) : null;
			if (fresh) emitSlottingUpdated(fresh.short_code, freshEpisode?.slottingRevision ?? fresh.slotting_revision, input.episodeNumber);
		}
		return result;
	} catch {
		return { success: false, error: 'database_error' };
	}
}
