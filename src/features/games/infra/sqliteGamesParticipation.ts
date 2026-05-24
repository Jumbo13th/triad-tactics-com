import { parseCanonicalSlotting } from '@/features/games/domain/slotting';
import type {
	ClaimPrioritySlotRepoResult,
	SwitchPrioritySlotRepoResult,
	LeavePrioritySlotRepoResult,
	JoinRegularGameRepoResult,
	LeaveRegularGameRepoResult
} from '@/features/games/ports';
import { getDb } from '@/platform/db/connection';
import {
	assignUserToPrioritySlot,
	emitSlottingUpdated,
	ensureAutoConversion,
	findSlotById,
	findUserHeldSlot,
	getMissionParticipationUser,
	isPriorityClaimOpen,
	isRegularJoinOpen,
	releaseUserPrioritySlot,
	selectEpisodeSlotting,
	selectMissionColumns,
	switchUserPrioritySlot,
	syncMissionsTableForEp1,
	userHasMissionPriorityBadge,
	type MissionRow
} from './sqliteGamesShared';

// ── Priority slot: claim ─────────────────────────────────────────────

export function claimPrioritySlot(input: {
	shortCode: string;
	slotId: string;
	steamId64: string;
	episodeNumber: number;
}): ClaimPrioritySlotRepoResult {
	const db = getDb();
	const selectMission = db.prepare(`
		SELECT ${selectMissionColumns()}
		FROM missions
		WHERE status = 'published' AND short_code IS NOT NULL AND LOWER(short_code) = LOWER(?)
		LIMIT 1
	`);
	const deleteRegularJoin = db.prepare(`
		DELETE FROM mission_regular_joins
		WHERE mission_id = ? AND user_id = ?
	`);
	const updateEpisodeSlotting = db.prepare(`
		UPDATE mission_episode_slotting
		SET slotting_json = ?,
			slotting_revision = slotting_revision + 1
		WHERE mission_id = ? AND episode_number = ? AND slotting_revision = ?
	`);
	const insertAudit = db.prepare(`
		INSERT INTO mission_audit_events (mission_id, actor_user_id, actor_steamid64, event_type, payload)
		VALUES (?, ?, ?, 'mission.slot.claimed', ?)
	`);

	try {
		const run = db.transaction((): ClaimPrioritySlotRepoResult => {
			const row = selectMission.get(input.shortCode) as MissionRow | undefined;
			if (!row || row.game_mode === 'simple') {
				return { success: false, error: 'mission_not_found' };
			}

			if (!isPriorityClaimOpen(row)) {
				return { success: false, error: 'claim_closed' };
			}

			// Lazy auto-conversion for scheduled priority open (priorityClaimOpensAt)
			ensureAutoConversion(db, row, input.episodeNumber);

			const user = getMissionParticipationUser(db, input.steamId64);
			if (!user) {
				return { success: false, error: 'database_error' };
			}

			const episode = selectEpisodeSlotting(db, row.id, input.episodeNumber);
			if (!episode) {
				return { success: false, error: 'slot_not_found' };
			}

			const slotting = episode.slotting;
			const slotContext = findSlotById(slotting, input.slotId);
			if (!slotContext || slotContext.slot.access !== 'priority') {
				return { success: false, error: 'slot_not_found' };
			}

			if (slotContext.slot.occupant?.type === 'user') {
				return { success: false, error: 'slot_taken' };
			}

			if (findUserHeldSlot(slotting, user.id)) {
				return { success: false, error: 'already_has_slot' };
			}

			if (!userHasMissionPriorityBadge(db, row.id, user.id)) {
				return { success: false, error: 'badge_required' };
			}

			const updatedSlotting = assignUserToPrioritySlot(slotting, {
				slotId: input.slotId,
				userId: user.id,
				callsign: user.current_callsign?.trim() || `Steam_${input.steamId64}`
			});

			const updatedSlottingJson = JSON.stringify(updatedSlotting);
			const updatedInfo = updateEpisodeSlotting.run(
				updatedSlottingJson,
				row.id,
				input.episodeNumber,
				episode.slottingRevision
			);

			if (updatedInfo.changes === 0) {
				const freshEpisode = selectEpisodeSlotting(db, row.id, input.episodeNumber);
				if (!freshEpisode) {
					return { success: false, error: 'mission_not_found' };
				}
				const freshSlotting = freshEpisode.slotting;
				const freshSlot = findSlotById(freshSlotting, input.slotId);
				if (!freshSlot || freshSlot.slot.access !== 'priority') {
					return { success: false, error: 'slot_not_found' };
				}
				if (freshSlot.slot.occupant?.type === 'user') {
					return { success: false, error: 'slot_taken' };
				}
				if (findUserHeldSlot(freshSlotting, user.id)) {
					return { success: false, error: 'already_has_slot' };
				}
				return { success: false, error: 'claim_conflict' };
			}

			syncMissionsTableForEp1(db, row.id, input.episodeNumber, updatedSlottingJson, input.steamId64);

			deleteRegularJoin.run(row.id, user.id);

			insertAudit.run(
				row.id,
				user.id,
				input.steamId64,
				JSON.stringify({ slotId: input.slotId, episodeNumber: input.episodeNumber, shortCode: row.short_code ?? null })
			);

			return { success: true };
		});

		const result = run();
		if (result.success) {
			const freshEpisode = selectEpisodeSlotting(db, (selectMission.get(input.shortCode) as MissionRow | undefined)?.id ?? 0, input.episodeNumber);
			const fresh = selectMission.get(input.shortCode) as MissionRow | undefined;
			if (fresh) emitSlottingUpdated(fresh.short_code, freshEpisode?.slottingRevision ?? fresh.slotting_revision, input.episodeNumber);
		}
		return result;
	} catch {
		return { success: false, error: 'database_error' };
	}
}

// ── Priority slot: switch ────────────────────────────────────────────

export function switchPrioritySlot(input: {
	shortCode: string;
	slotId: string;
	steamId64: string;
	episodeNumber: number;
}): SwitchPrioritySlotRepoResult {
	const db = getDb();
	const selectMission = db.prepare(`
		SELECT ${selectMissionColumns()}
		FROM missions
		WHERE status = 'published' AND short_code IS NOT NULL AND LOWER(short_code) = LOWER(?)
		LIMIT 1
	`);
	const deleteRegularJoin = db.prepare(`
		DELETE FROM mission_regular_joins
		WHERE mission_id = ? AND user_id = ?
	`);
	const updateEpisodeSlotting = db.prepare(`
		UPDATE mission_episode_slotting
		SET slotting_json = ?,
			slotting_revision = slotting_revision + 1
		WHERE mission_id = ? AND episode_number = ? AND slotting_revision = ?
	`);
	const insertAudit = db.prepare(`
		INSERT INTO mission_audit_events (mission_id, actor_user_id, actor_steamid64, event_type, payload)
		VALUES (?, ?, ?, 'mission.slot.switched', ?)
	`);

	try {
		const run = db.transaction((): SwitchPrioritySlotRepoResult => {
			const row = selectMission.get(input.shortCode) as MissionRow | undefined;
			if (!row || row.game_mode === 'simple') {
				return { success: false, error: 'mission_not_found' };
			}

			if (!isPriorityClaimOpen(row)) {
				return { success: false, error: 'claim_closed' };
			}

			ensureAutoConversion(db, row, input.episodeNumber);

			const user = getMissionParticipationUser(db, input.steamId64);
			if (!user) {
				return { success: false, error: 'database_error' };
			}

			const episode = selectEpisodeSlotting(db, row.id, input.episodeNumber);
			if (!episode) {
				return { success: false, error: 'slot_not_found' };
			}

			const slotting = episode.slotting;
			const currentHeld = findUserHeldSlot(slotting, user.id);
			if (!currentHeld || currentHeld.slot.access !== 'priority') {
				return { success: false, error: 'no_current_slot' };
			}

			const target = findSlotById(slotting, input.slotId);
			if (!target || target.slot.access !== 'priority') {
				return { success: false, error: 'slot_not_found' };
			}

			if (target.slot.id === currentHeld.slot.id) {
				return { success: false, error: 'already_in_slot' };
			}

			if (target.slot.occupant?.type === 'user') {
				return { success: false, error: 'slot_taken' };
			}

			const updatedSlotting = switchUserPrioritySlot(slotting, {
				fromSlotId: currentHeld.slot.id,
				toSlotId: input.slotId,
				userId: user.id,
				callsign: user.current_callsign?.trim() || `Steam_${input.steamId64}`
			});

			const updatedSlottingJson = JSON.stringify(updatedSlotting);
			const updatedInfo = updateEpisodeSlotting.run(
				updatedSlottingJson,
				row.id,
				input.episodeNumber,
				episode.slottingRevision
			);

			if (updatedInfo.changes === 0) {
				const freshEpisode = selectEpisodeSlotting(db, row.id, input.episodeNumber);
				if (!freshEpisode) {
					return { success: false, error: 'mission_not_found' };
				}
				const freshSlotting = freshEpisode.slotting;
				const freshCurrentHeld = findUserHeldSlot(freshSlotting, user.id);
				if (!freshCurrentHeld || freshCurrentHeld.slot.access !== 'priority') {
					return { success: false, error: 'no_current_slot' };
				}
				const freshTarget = findSlotById(freshSlotting, input.slotId);
				if (!freshTarget || freshTarget.slot.access !== 'priority') {
					return { success: false, error: 'slot_not_found' };
				}
				if (freshTarget.slot.id === freshCurrentHeld.slot.id) {
					return { success: false, error: 'already_in_slot' };
				}
				if (freshTarget.slot.occupant?.type === 'user') {
					return { success: false, error: 'slot_taken' };
				}
				return { success: false, error: 'switch_conflict' };
			}

			syncMissionsTableForEp1(db, row.id, input.episodeNumber, updatedSlottingJson, input.steamId64);

			deleteRegularJoin.run(row.id, user.id);

			insertAudit.run(
				row.id,
				user.id,
				input.steamId64,
				JSON.stringify({
					fromSlotId: currentHeld.slot.id,
					toSlotId: input.slotId,
					episodeNumber: input.episodeNumber,
					shortCode: row.short_code ?? null
				})
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

// ── Priority slot: leave ─────────────────────────────────────────────

export function leavePrioritySlot(input: {
	shortCode: string;
	steamId64: string;
	episodeNumber: number;
}): LeavePrioritySlotRepoResult {
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
		VALUES (?, ?, ?, 'mission.slot.left', ?)
	`);

	try {
		const run = db.transaction((): LeavePrioritySlotRepoResult => {
			const row = selectMission.get(input.shortCode) as MissionRow | undefined;
			if (!row || row.game_mode === 'simple') {
				return { success: false, error: 'mission_not_found' };
			}

			const user = getMissionParticipationUser(db, input.steamId64);
			if (!user) {
				return { success: false, error: 'database_error' };
			}

			const episode = selectEpisodeSlotting(db, row.id, input.episodeNumber);
			if (!episode) {
				return { success: false, error: 'no_current_slot' };
			}

			const slotting = episode.slotting;
			const currentHeld = findUserHeldSlot(slotting, user.id);
			if (!currentHeld || currentHeld.slot.access !== 'priority') {
				return { success: false, error: 'no_current_slot' };
			}

			const updatedSlotting = releaseUserPrioritySlot(slotting, {
				slotId: currentHeld.slot.id,
				userId: user.id
			});

			const updatedSlottingJson = JSON.stringify(updatedSlotting);
			const updatedInfo = updateEpisodeSlotting.run(
				updatedSlottingJson,
				row.id,
				input.episodeNumber,
				episode.slottingRevision
			);

			if (updatedInfo.changes === 0) {
				const freshEpisode = selectEpisodeSlotting(db, row.id, input.episodeNumber);
				if (!freshEpisode) {
					return { success: false, error: 'mission_not_found' };
				}
				const freshSlotting = freshEpisode.slotting;
				const freshCurrentHeld = findUserHeldSlot(freshSlotting, user.id);
				if (!freshCurrentHeld || freshCurrentHeld.slot.access !== 'priority') {
					return { success: false, error: 'no_current_slot' };
				}
				return { success: false, error: 'leave_conflict' };
			}

			syncMissionsTableForEp1(db, row.id, input.episodeNumber, updatedSlottingJson, input.steamId64);

			insertAudit.run(
				row.id,
				user.id,
				input.steamId64,
				JSON.stringify({
					slotId: currentHeld.slot.id,
					episodeNumber: input.episodeNumber,
					shortCode: row.short_code ?? null
				})
			);

			return { success: true, left: true };
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

// ── Regular game: join ───────────────────────────────────────────────

export function joinRegularGame(input: {
	shortCode: string;
	steamId64: string;
}): JoinRegularGameRepoResult {
	const db = getDb();
	const selectMission = db.prepare(`
		SELECT ${selectMissionColumns()}
		FROM missions
		WHERE status = 'published' AND short_code IS NOT NULL AND LOWER(short_code) = LOWER(?)
		LIMIT 1
	`);
	const insertJoin = db.prepare(`
		INSERT INTO mission_regular_joins (mission_id, user_id, joined_by_steamid64)
		VALUES (?, ?, ?)
		ON CONFLICT(mission_id, user_id) DO NOTHING
	`);
	const insertAudit = db.prepare(`
		INSERT INTO mission_audit_events (mission_id, actor_user_id, actor_steamid64, event_type, payload)
		VALUES (?, ?, ?, 'mission.regular_joined', ?)
	`);

	try {
		const run = db.transaction((): JoinRegularGameRepoResult => {
			const row = selectMission.get(input.shortCode) as MissionRow | undefined;
			if (!row) {
				return { success: false, error: 'mission_not_found' };
			}

			const user = getMissionParticipationUser(db, input.steamId64);
			if (!user) {
				return { success: false, error: 'database_error' };
			}

			const slotting = parseCanonicalSlotting(row.slotting_json);
			if (!isRegularJoinOpen(row)) {
				return { success: false, error: 'join_closed' };
			}

			if (findUserHeldSlot(slotting, user.id)) {
				return { success: false, error: 'already_has_slot' };
			}

			const info = insertJoin.run(row.id, user.id, input.steamId64);
			if (info.changes > 0) {
				insertAudit.run(
					row.id,
					user.id,
					input.steamId64,
					JSON.stringify({ shortCode: row.short_code ?? null })
				);
			}

			return { success: true, joined: info.changes > 0 };
		});

		return run();
	} catch {
		return { success: false, error: 'database_error' };
	}
}

// ── Regular game: leave ──────────────────────────────────────────────

export function leaveRegularGame(input: {
	shortCode: string;
	steamId64: string;
}): LeaveRegularGameRepoResult {
	const db = getDb();
	const selectMission = db.prepare(`
		SELECT id, short_code
		FROM missions
		WHERE status = 'published' AND short_code IS NOT NULL AND LOWER(short_code) = LOWER(?)
		LIMIT 1
	`);
	const deleteJoin = db.prepare(`
		DELETE FROM mission_regular_joins
		WHERE mission_id = ? AND user_id = ?
	`);
	const insertAudit = db.prepare(`
		INSERT INTO mission_audit_events (mission_id, actor_user_id, actor_steamid64, event_type, payload)
		VALUES (?, ?, ?, 'mission.regular_left', ?)
	`);

	try {
		const run = db.transaction((): LeaveRegularGameRepoResult => {
			const mission = selectMission.get(input.shortCode) as { id: number; short_code: string | null } | undefined;
			if (!mission) {
				return { success: false, error: 'mission_not_found' };
			}

			const user = getMissionParticipationUser(db, input.steamId64);
			if (!user) {
				return { success: false, error: 'database_error' };
			}

			const info = deleteJoin.run(mission.id, user.id);
			if (info.changes > 0) {
				insertAudit.run(
					mission.id,
					user.id,
					input.steamId64,
					JSON.stringify({ shortCode: mission.short_code ?? null })
				);
			}

			return { success: true, left: info.changes > 0 };
		});

		return run();
	} catch {
		return { success: false, error: 'database_error' };
	}
}
