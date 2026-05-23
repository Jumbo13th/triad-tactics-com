import {
	clearUserOccupants,
	detectDestructiveSlottingChanges,
	emptyCanonicalSlotting,
	parseCanonicalSlotting
} from '@/features/games/domain/slotting';
import type {
	CreateMissionUpdateRequest,
	DeleteArchivedMissionRequest,
	PublishGameRequest,
	UpdateGameSettingsRequest,
	UpdateGameSlottingRequest
} from '@/features/games/domain/requests';
import type {
	AdminGamesOverview,
	CurrentGameSummary,
	GameAdminMission,
	GameArchiveSummary
} from '@/features/games/domain/types';
import type {
	GetMissionAuditRepoResult,
	CreateMissionUpdateRepoResult,
	CreateGameDraftRepoResult,
	DeleteArchivedMissionRepoResult,
	DeleteCurrentDraftRepoResult,
	GetAdminGameMissionRepoResult,
	GetGameArchiveSummariesRepoResult,
	GetGameByShortCodeRepoResult,
	PublishGameRepoResult,
	UpdateGameSlottingRepoResult,
	UpdateGameSettingsRepoResult,
	UpdateMissionUpdateRepoResult
} from '@/features/games/ports';
import { getDb } from '@/platform/db/connection';

import {
	badgeTypeIdsExist,
	emitSlottingUpdated,
	emptyLocalizedDescription,
	ensureAutoConversion,
	getMissionParticipationUser,
	isSqliteConstraintError,
	mapArchiveSummaryRow,
	mapMissionDetailForViewer,
	mapMissionRow,
	mapMissionSettingsAudit,
	normalizeArchiveCompletedResult,
	parseAuditPayload,
	parseLocalizedDescription,
	resolvePasswordUpdate,
	selectEpisodeSlotting,
	selectEpisodeSlottings,
	selectMissionColumns,
	syncMissionsTableForEp1,
	selectPriorityBadgeTypeIds,
	validatePublishableMission,
	type MissionRow,
	type MissionAuditRow
} from './sqliteGamesShared';

export {
	releaseUnitGameplay,
	hideUnitGameplay,
	releasePriorityGameplay,
	hidePriorityGameplay,
	releaseRegularGameplay,
	hideRegularGameplay
} from './sqliteGamesGameplay';

export {
	claimPrioritySlot,
	switchPrioritySlot,
	leavePrioritySlot,
	joinRegularGame,
	leaveRegularGame
} from './sqliteGamesParticipation';

export {
	updateUnitAssignments,
	claimUnitSlot,
	releaseUnitSlot
} from './sqliteGamesUnitSlotting';

// ── Slotting save helper ─────────────────────────────────────────────

function saveSlottingUpdate(input: {
	db: ReturnType<typeof getDb>;
	row: MissionRow;
	missionId: number;
	episodeNumber: number;
	slottingRevision: number;
	nextSlotting: ReturnType<typeof parseCanonicalSlotting>;
	updatedBySteamId64: string;
	confirmDestructive: boolean;
	source: 'canonical' | 'legacy_import';
}):
	| { success: true; mission: GameAdminMission }
	| {
			success: false;
			error: 'slotting_revision_conflict' | 'destructive_change_requires_confirmation' | 'episode_not_found' | 'database_error';
			destructiveChanges?: ReturnType<typeof detectDestructiveSlottingChanges>;
	  } {
	const selectMission = input.db.prepare(`
		SELECT ${selectMissionColumns()}
		FROM missions
		WHERE id = ?
		LIMIT 1
	`);
	const updateEpisodeSlotting = input.db.prepare(`
		UPDATE mission_episode_slotting
		SET slotting_json = ?,
			slotting_revision = slotting_revision + 1
		WHERE mission_id = ? AND episode_number = ? AND slotting_revision = ?
	`);
	const insertAudit = input.db.prepare(`
		INSERT INTO mission_audit_events (mission_id, actor_steamid64, event_type, payload)
		VALUES (?, ?, 'mission.slotting.updated', ?)
	`);

	const insertNewEpisode = input.db.prepare(`
		INSERT INTO mission_episode_slotting (mission_id, episode_number, slotting_json, slotting_revision)
		VALUES (?, ?, ?, 1)
	`);

	const currentEpisode = selectEpisodeSlotting(input.db, input.missionId, input.episodeNumber);
	if (!currentEpisode) {
		try {
			insertNewEpisode.run(input.missionId, input.episodeNumber, JSON.stringify(input.nextSlotting));

			// Copy unit assignments from the latest existing episode
			const sourceEpisode = input.db.prepare(`
				SELECT episode_number FROM mission_unit_assignments
				WHERE mission_id = ? AND episode_number < ?
				ORDER BY episode_number DESC LIMIT 1
			`).get(input.missionId, input.episodeNumber) as { episode_number: number } | undefined;

			if (sourceEpisode) {
				input.db.prepare(`
					INSERT INTO mission_unit_assignments (mission_id, unit_id, side_id, episode_number, assigned_by_steamid64)
					SELECT mission_id, unit_id, side_id, ?, assigned_by_steamid64
					FROM mission_unit_assignments
					WHERE mission_id = ? AND episode_number = ?
				`).run(input.episodeNumber, input.missionId, sourceEpisode.episode_number);
			}
		} catch {
			return { success: false, error: 'database_error' };
		}

		const selectMissionForReturn = input.db.prepare(`SELECT ${selectMissionColumns()} FROM missions WHERE id = ? LIMIT 1`);
		const updated = selectMissionForReturn.get(input.missionId) as MissionRow | undefined;
		if (!updated) return { success: false, error: 'database_error' };

		insertAudit.run(
			input.missionId,
			input.updatedBySteamId64,
			JSON.stringify({
				source: input.source,
				episodeNumber: input.episodeNumber,
				before: emptyCanonicalSlotting,
				after: input.nextSlotting,
				destructiveChanges: []
			})
		);

		emitSlottingUpdated(updated.short_code, 1, input.episodeNumber);
		return { success: true, mission: mapMissionRow(input.db, updated) };
	}
	const currentSlotting = currentEpisode.slotting;

	const destructiveChanges =
		input.row.status === 'published' ? detectDestructiveSlottingChanges(currentSlotting, input.nextSlotting) : [];
	if (input.row.status === 'published' && destructiveChanges.length > 0 && !input.confirmDestructive) {
		return {
			success: false,
			error: 'destructive_change_requires_confirmation',
			destructiveChanges
		};
	}

	const nextSlottingJson = JSON.stringify(input.nextSlotting);

	const updatedInfo = updateEpisodeSlotting.run(
		nextSlottingJson,
		input.missionId,
		input.episodeNumber,
		input.slottingRevision
	);
	if (updatedInfo.changes === 0) {
		return { success: false, error: 'slotting_revision_conflict' };
	}

	syncMissionsTableForEp1(input.db, input.missionId, input.episodeNumber, nextSlottingJson, input.updatedBySteamId64);

	const updated = selectMission.get(input.missionId) as MissionRow | undefined;
	if (!updated) {
		return { success: false, error: 'database_error' };
	}

	const freshEpisode = selectEpisodeSlotting(input.db, input.missionId, input.episodeNumber);

	insertAudit.run(
		input.missionId,
		input.updatedBySteamId64,
		JSON.stringify({
			source: input.source,
			episodeNumber: input.episodeNumber,
			before: currentSlotting,
			after: input.nextSlotting,
			destructiveChanges
		})
	);

	emitSlottingUpdated(updated.short_code, freshEpisode?.slottingRevision ?? updated.slotting_revision, input.episodeNumber);
	return { success: true, mission: mapMissionRow(input.db, updated) };
}

// ── Admin overview ───────────────────────────────────────────────────

export function getAdminGamesOverview(): AdminGamesOverview {
	const db = getDb();
	const draftRow = db
		.prepare(`
			SELECT ${selectMissionColumns()}
			FROM missions
			WHERE status = 'draft'
			LIMIT 1
		`)
		.get() as MissionRow | undefined;
	const publishedRow = db
		.prepare(`
			SELECT ${selectMissionColumns()}
			FROM missions
			WHERE status = 'published'
			LIMIT 1
		`)
		.get() as MissionRow | undefined;
	const archivedRows = db
		.prepare(`
			SELECT ${selectMissionColumns()}
			FROM missions
			WHERE status = 'archived'
			ORDER BY COALESCE(archived_at, updated_at) DESC, id DESC
		`)
		.all() as MissionRow[];

	return {
		draft: draftRow ? mapMissionRow(db, draftRow) : null,
		published: publishedRow ? mapMissionRow(db, publishedRow) : null,
		archivedMissions: archivedRows.map((row) => mapMissionRow(db, row))
	};
}

// ── Draft CRUD ───────────────────────────────────────────────────────

export function createDraft(input: {
	mode: 'blank' | 'duplicate_previous';
	createdBySteamId64: string;
}): CreateGameDraftRepoResult {
	const db = getDb();
	const selectDraft = db.prepare(`
		SELECT 1
		FROM missions
		WHERE status = 'draft'
		LIMIT 1
	`);
	const selectPublishedSource = db.prepare(`
		SELECT slotting_json
		FROM missions
		WHERE status = 'published'
		LIMIT 1
	`);
	const selectArchivedSource = db.prepare(`
		SELECT slotting_json
		FROM missions
		WHERE status = 'archived'
		ORDER BY COALESCE(archived_at, updated_at) DESC, id DESC
		LIMIT 1
	`);
	const insertDraft = db.prepare(`
		INSERT INTO missions (
			short_code,
			status,
			title,
			description,
			starts_at,
			server_name,
			server_host,
			server_port,
			early_password,
			final_password,
			priority_claim_opens_at,
			priority_claim_manual_state,
			regular_join_enabled,
			priority_gameplay_released_at,
			regular_gameplay_released_at,
			slotting_json,
			slotting_revision,
			settings_revision,
			published_at,
			archived_at,
			archive_status,
			archive_reason,
			archive_result_json,
			created_by_steamid64,
			updated_by_steamid64
		)
		VALUES (?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?, ?, ?)
	`);
	const selectInserted = db.prepare(`
		SELECT ${selectMissionColumns()}
		FROM missions
		WHERE id = ?
		LIMIT 1
	`);
	const insertAudit = db.prepare(`
		INSERT INTO mission_audit_events (mission_id, actor_steamid64, event_type, payload)
		VALUES (?, ?, 'mission.created', ?)
	`);
	const insertEpisodeSlotting = db.prepare(`
		INSERT OR REPLACE INTO mission_episode_slotting (mission_id, episode_number, slotting_json, slotting_revision)
		VALUES (?, ?, ?, 1)
	`);
	const selectSourceEpisodeSlottings = db.prepare(`
		SELECT episode_number, slotting_json
		FROM mission_episode_slotting
		WHERE mission_id = ?
		ORDER BY episode_number ASC
	`);

	try {
		const run = db.transaction((): CreateGameDraftRepoResult => {
			if (selectDraft.get()) {
				return { success: false, error: 'draft_exists' };
			}

			let slottingJson = JSON.stringify(emptyCanonicalSlotting);
			let sourceEpisodeSlottings: Array<{ episode_number: number; slotting_json: string }> = [];
			if (input.mode === 'duplicate_previous') {
				const sourceRow =
					(selectPublishedSource.get() as { slotting_json: string } | undefined) ??
					(selectArchivedSource.get() as { slotting_json: string } | undefined);
				if (!sourceRow) {
					return { success: false, error: 'no_source_mission' };
				}
				slottingJson = JSON.stringify(clearUserOccupants(parseCanonicalSlotting(sourceRow.slotting_json)));

				const sourceIdRow = db.prepare(`
					SELECT id FROM missions WHERE status = 'published' LIMIT 1
				`).get() as { id: number } | undefined;
				const archivedIdRow = sourceIdRow ? undefined : db.prepare(`
					SELECT id FROM missions WHERE status = 'archived' ORDER BY COALESCE(archived_at, updated_at) DESC, id DESC LIMIT 1
				`).get() as { id: number } | undefined;
				const sourceMissionId = sourceIdRow?.id ?? archivedIdRow?.id;
				if (sourceMissionId) {
					sourceEpisodeSlottings = selectSourceEpisodeSlottings.all(sourceMissionId) as Array<{ episode_number: number; slotting_json: string }>;
				}
			}

			const inserted = insertDraft.run(
				null,
				'',
				JSON.stringify(emptyLocalizedDescription),
				null,
				'',
				'',
				null,
				null,
				null,
				null,
				'default',
				1,
				null,
				null,
				slottingJson,
				null,
				null,
				null,
				null,
				null,
				input.createdBySteamId64,
				input.createdBySteamId64
			);

			const rowIdRaw = inserted.lastInsertRowid;
			const rowId = typeof rowIdRaw === 'bigint' ? Number(rowIdRaw) : (rowIdRaw as number);

			if (sourceEpisodeSlottings.length > 0) {
				for (const ep of sourceEpisodeSlottings) {
					const clearedJson = JSON.stringify(clearUserOccupants(parseCanonicalSlotting(ep.slotting_json)));
					insertEpisodeSlotting.run(rowId, ep.episode_number, clearedJson);
				}
			} else {
				insertEpisodeSlotting.run(rowId, 1, slottingJson);
			}

			insertAudit.run(rowId, input.createdBySteamId64, JSON.stringify({ mode: input.mode }));
			const created = selectInserted.get(rowId) as MissionRow | undefined;
			if (!created) {
				return { success: false, error: 'database_error' };
			}

			return { success: true, mission: mapMissionRow(db, created) };
		});

		return run();
	} catch {
		return { success: false, error: 'database_error' };
	}
}

export function getMissionById(input: { missionId: number }): GetAdminGameMissionRepoResult {
	const db = getDb();
	const row = db
		.prepare(`
			SELECT ${selectMissionColumns()}
			FROM missions
			WHERE id = ?
			LIMIT 1
		`)
		.get(input.missionId) as MissionRow | undefined;

	if (!row) {
		return { success: false, error: 'not_found' };
	}

	try {
		return { success: true, mission: mapMissionRow(db, row) };
	} catch {
		return { success: false, error: 'database_error' };
	}
}

export function deleteCurrentDraft(): DeleteCurrentDraftRepoResult {
	const db = getDb();
	const selectDraft = db.prepare(`
		SELECT id
		FROM missions
		WHERE status = 'draft'
		LIMIT 1
	`);
	const deleteMission = db.prepare(`
		DELETE FROM missions
		WHERE id = ?
	`);

	try {
		const run = db.transaction((): DeleteCurrentDraftRepoResult => {
			const row = selectDraft.get() as { id: number } | undefined;
			if (!row) {
				return { success: false, error: 'not_found' };
			}

			deleteMission.run(row.id);
			return { success: true };
		});

		return run();
	} catch {
		return { success: false, error: 'database_error' };
	}
}

// ── Settings ─────────────────────────────────────────────────────────

export function updateSettings(
	input: UpdateGameSettingsRequest & { missionId: number; updatedBySteamId64: string }
): UpdateGameSettingsRepoResult {
	const db = getDb();
	const selectMission = db.prepare(`
		SELECT ${selectMissionColumns()}
		FROM missions
		WHERE id = ?
		LIMIT 1
	`);
	const selectShortCodeConflict = db.prepare(`
		SELECT id
		FROM missions
		WHERE id != ?
			AND short_code IS NOT NULL
			AND TRIM(short_code) != ''
			AND LOWER(short_code) = LOWER(?)
		LIMIT 1
	`);
	const updateMission = db.prepare(`
		UPDATE missions
		SET short_code = ?,
			title = ?,
			description = ?,
			starts_at = ?,
			server_name = ?,
			server_host = ?,
			server_port = ?,
			early_password = ?,
			final_password = ?,
			priority_claim_opens_at = ?,
			priority_claim_manual_state = ?,
			unit_slotting_manual_state = ?,
			regular_join_enabled = ?,
			server_details_hidden = ?,
			skip_priority_discord = ?,
			settings_revision = settings_revision + 1,
			updated_at = CURRENT_TIMESTAMP,
			updated_by_steamid64 = ?
		WHERE id = ? AND settings_revision = ?
	`);
	const deletePriorityBadges = db.prepare(`
		DELETE FROM mission_priority_badges
		WHERE mission_id = ?
	`);
	const insertPriorityBadge = db.prepare(`
		INSERT INTO mission_priority_badges (mission_id, badge_type_id)
		VALUES (?, ?)
	`);
	const insertAudit = db.prepare(`
		INSERT INTO mission_audit_events (mission_id, actor_steamid64, event_type, payload)
		VALUES (?, ?, 'mission.settings.updated', ?)
	`);

	try {
		const run = db.transaction((): UpdateGameSettingsRepoResult => {
			const row = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!row) {
				return { success: false, error: 'not_found' };
			}

			if (row.settings_revision !== input.settingsRevision) {
				return { success: false, error: 'settings_revision_conflict' };
			}

			const badgeTypeIds = [...new Set(input.priorityBadgeTypeIds)];
			if (!badgeTypeIdsExist(db, badgeTypeIds)) {
				return { success: false, error: 'badge_not_found' };
			}

			const currentShortCode = row.short_code ?? null;
			const nextShortCode = input.shortCode;
			if (row.status !== 'draft' && nextShortCode !== currentShortCode) {
				return { success: false, error: 'short_code_locked' };
			}

			if (nextShortCode) {
				const shortCodeConflict = selectShortCodeConflict.get(input.missionId, nextShortCode) as
					| { id: number }
					| undefined;
				if (shortCodeConflict) {
					return { success: false, error: 'short_code_taken' };
				}
			}

			const beforeBadgeTypeIds = selectPriorityBadgeTypeIds(db, input.missionId);
			const before = mapMissionSettingsAudit(row, beforeBadgeTypeIds);
			const earlyPw = resolvePasswordUpdate(row.early_password, input.earlyPassword);
			const finalPw = resolvePasswordUpdate(row.final_password, input.finalPassword);

			const updatedInfo = updateMission.run(
				nextShortCode,
				input.title,
				JSON.stringify(input.description),
				input.startsAt,
				input.serverName,
				input.serverHost,
				input.serverPort,
				earlyPw,
				finalPw,
				input.priorityClaimOpensAt,
				input.priorityClaimManualState,
				input.unitSlottingManualState,
				input.regularJoinEnabled ? 1 : 0,
				input.serverDetailsHidden ? 1 : 0,
				input.skipPriorityDiscord ? 1 : 0,
				input.updatedBySteamId64,
				input.missionId,
				input.settingsRevision
			);

			if (updatedInfo.changes === 0) {
				return { success: false, error: 'settings_revision_conflict' };
			}

			deletePriorityBadges.run(input.missionId);
			for (const badgeTypeId of badgeTypeIds) {
				insertPriorityBadge.run(input.missionId, badgeTypeId);
			}

			if (input.priorityClaimManualState === 'open' && row.priority_claim_manual_state !== 'open') {
				const freshRow = selectMission.get(input.missionId) as MissionRow | undefined;
				if (freshRow) {
					const allEpisodes = selectEpisodeSlottings(db, input.missionId);
					for (const ep of allEpisodes) {
						ensureAutoConversion(db, freshRow, ep.episodeNumber);
					}
				}
			}

			const priorityConfigChanged =
				input.priorityClaimManualState !== row.priority_claim_manual_state ||
				(input.priorityClaimOpensAt ?? null) !== (row.priority_claim_opens_at ?? null);
			if (priorityConfigChanged) {
				db.prepare(`UPDATE missions SET priority_discord_sent = 0 WHERE id = ?`).run(input.missionId);
			}

			const updated = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!updated) {
				return { success: false, error: 'database_error' };
			}

			const afterBadgeTypeIds = selectPriorityBadgeTypeIds(db, input.missionId);
			insertAudit.run(
				input.missionId,
				input.updatedBySteamId64,
				JSON.stringify({
					before,
					after: mapMissionSettingsAudit(updated, afterBadgeTypeIds)
				})
			);

			return { success: true, mission: mapMissionRow(db, updated) };
		});

		return run();
	} catch (error: unknown) {
		if (
			isSqliteConstraintError(error, 'idx_missions_short_code_unique') ||
			isSqliteConstraintError(error, 'UNIQUE constraint failed: index')
		) {
			return { success: false, error: 'short_code_taken' };
		}
		return { success: false, error: 'database_error' };
	}
}

// ── Slotting update ──────────────────────────────────────────────────

export function updateSlotting(
	input: UpdateGameSlottingRequest & { missionId: number; updatedBySteamId64: string }
): UpdateGameSlottingRepoResult {
	const db = getDb();
	const selectMission = db.prepare(`
		SELECT ${selectMissionColumns()}
		FROM missions
		WHERE id = ?
		LIMIT 1
	`);

	try {
		const run = db.transaction((): UpdateGameSlottingRepoResult => {
			const row = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!row) {
				return { success: false, error: 'not_found' };
			}

			const nextSlotting = parseCanonicalSlotting(input.slotting);
			return saveSlottingUpdate({
				db,
				row,
				missionId: input.missionId,
				episodeNumber: input.episodeNumber,
				slottingRevision: input.slottingRevision,
				nextSlotting,
				updatedBySteamId64: input.updatedBySteamId64,
				confirmDestructive: input.confirmDestructive,
				source: 'canonical'
			});
		});

		return run();
	} catch (error: unknown) {
		if (error instanceof Error && error.name === 'ZodError') {
			return { success: false, error: 'slotting_invalid' };
		}
		return { success: false, error: 'database_error' };
	}
}

// ── Episode deletion ────────────────────────────────────────────

export type DeleteEpisodeSlottingResult =
	| { success: true; mission: GameAdminMission }
	| {
			success: false;
			error: 'not_found' | 'cannot_delete_episode_1' | 'episode_not_found' | 'has_occupied_slots' | 'database_error';
			occupiedCount?: number;
	  };

export function deleteEpisodeSlotting(input: {
	missionId: number;
	episodeNumber: number;
	confirmOccupied: boolean;
	deletedBySteamId64: string;
}): DeleteEpisodeSlottingResult {
	const db = getDb();

	if (input.episodeNumber === 1) {
		return { success: false, error: 'cannot_delete_episode_1' };
	}

	try {
		const run = db.transaction((): DeleteEpisodeSlottingResult => {
			const selectMission = db.prepare(`SELECT ${selectMissionColumns()} FROM missions WHERE id = ? LIMIT 1`);
			const row = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!row) {
				return { success: false, error: 'not_found' };
			}

			const episode = selectEpisodeSlotting(db, input.missionId, input.episodeNumber);
			if (!episode) {
				return { success: false, error: 'episode_not_found' };
			}

			if (!input.confirmOccupied) {
				let occupiedCount = 0;
				for (const side of episode.slotting.sides) {
					for (const squad of side.squads) {
						for (const slot of squad.slots) {
							if (slot.occupant !== null) occupiedCount++;
						}
					}
				}
				if (occupiedCount > 0) {
					return { success: false, error: 'has_occupied_slots', occupiedCount };
				}
			}

			db.prepare(`DELETE FROM mission_episode_slotting WHERE mission_id = ? AND episode_number = ?`)
				.run(input.missionId, input.episodeNumber);

			db.prepare(`DELETE FROM mission_unit_assignments WHERE mission_id = ? AND episode_number = ?`)
				.run(input.missionId, input.episodeNumber);

			db.prepare(`
				INSERT INTO mission_audit_events (mission_id, actor_steamid64, event_type, payload)
				VALUES (?, ?, 'mission.episode.deleted', ?)
			`).run(
				input.missionId,
				input.deletedBySteamId64,
				JSON.stringify({ episodeNumber: input.episodeNumber })
			);

			const updated = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!updated) return { success: false, error: 'database_error' };

			return { success: true, mission: mapMissionRow(db, updated) };
		});

		const result = run();
		if (result.success) {
			emitSlottingUpdated(result.mission.shortCode, result.mission.slottingRevision, input.episodeNumber);
		}
		return result;
	} catch {
		return { success: false, error: 'database_error' };
	}
}

// ── Publishing ───────────────────────────────────────────────────────

export function publishMission(
	input: PublishGameRequest & { missionId: number; publishedBySteamId64: string }
): PublishGameRepoResult {
	const db = getDb();
	const selectMission = db.prepare(`
		SELECT ${selectMissionColumns()}
		FROM missions
		WHERE id = ?
		LIMIT 1
	`);
	const selectExistingPublishedMission = db.prepare(`
		SELECT id
		FROM missions
		WHERE status = 'published' AND id != ?
		LIMIT 1
	`);
	const selectPriorityBadgeCount = db.prepare(`
		SELECT COUNT(1) AS count
		FROM mission_priority_badges
		WHERE mission_id = ?
	`);
	const publishMissionStatement = db.prepare(`
		UPDATE missions
		SET status = 'published',
			published_at = CURRENT_TIMESTAMP,
			published_by_steamid64 = ?,
			settings_revision = settings_revision + 1,
			updated_at = CURRENT_TIMESTAMP,
			updated_by_steamid64 = ?
		WHERE id = ? AND settings_revision = ? AND status = 'draft'
	`);
	const insertAudit = db.prepare(`
		INSERT INTO mission_audit_events (mission_id, actor_steamid64, event_type, payload)
		VALUES (?, ?, 'mission.published', ?)
	`);

	try {
		const run = db.transaction((): PublishGameRepoResult => {
			const row = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!row) {
				return { success: false, error: 'not_found' };
			}

			if (row.settings_revision !== input.settingsRevision) {
				return { success: false, error: 'settings_revision_conflict' };
			}

			if (row.status !== 'draft') {
				return { success: false, error: 'not_draft' };
			}

			if (selectExistingPublishedMission.get(input.missionId)) {
				return { success: false, error: 'published_mission_exists' };
			}

			const priorityBadgeCount =
				(selectPriorityBadgeCount.get(input.missionId) as { count?: number } | undefined)?.count ?? 0;
			const reasons = validatePublishableMission({ db, row, priorityBadgeCount });
			if (reasons.length > 0) {
				return { success: false, error: 'publish_validation_failed', reasons };
			}

			const updatedInfo = publishMissionStatement.run(
				input.publishedBySteamId64,
				input.publishedBySteamId64,
				input.missionId,
				input.settingsRevision
			);
			if (updatedInfo.changes === 0) {
				return { success: false, error: 'settings_revision_conflict' };
			}

			const published = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!published) {
				return { success: false, error: 'database_error' };
			}

			insertAudit.run(
				input.missionId,
				input.publishedBySteamId64,
				JSON.stringify({ shortCode: published.short_code ?? null })
			);

			return { success: true, mission: mapMissionRow(db, published) };
		});

		return run();
	} catch (error: unknown) {
		if (
			isSqliteConstraintError(error, 'idx_missions_single_published') ||
			isSqliteConstraintError(error, 'UNIQUE constraint failed: missions.status')
		) {
			return { success: false, error: 'published_mission_exists' };
		}
		return { success: false, error: 'database_error' };
	}
}

// ── Archiving ────────────────────────────────────────────────────────

export function archiveGame(input: {
	missionId: number;
	archivedBySteamId64: string;
	result: { winnerSideId: string | null; sideScores: Array<{ sideId: string; score: number }> };
}): import('@/features/games/ports').ArchiveGameRepoResult {
	const db = getDb();
	const selectMission = db.prepare(`
		SELECT ${selectMissionColumns()}
		FROM missions
		WHERE id = ?
		LIMIT 1
	`);
	const archiveMission = db.prepare(`
		UPDATE missions
		SET status = 'archived',
			archived_at = CURRENT_TIMESTAMP,
			archive_status = 'completed',
			archive_reason = NULL,
			archive_result_json = ?,
			priority_claim_manual_state = 'closed',
			regular_join_enabled = 0,
			image_data = NULL,
			image_mime = NULL,
			updated_at = CURRENT_TIMESTAMP,
			updated_by_steamid64 = ?,
			archived_by_steamid64 = ?
		WHERE id = ? AND status = 'published'
	`);
	const insertAudit = db.prepare(`
		INSERT INTO mission_audit_events (mission_id, actor_steamid64, event_type, payload)
		VALUES (?, ?, 'mission.archived', ?)
	`);

	try {
		const run = db.transaction(() => {
			const row = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!row) {
				return { success: false as const, error: 'not_found' as const };
			}

			if (row.status === 'archived') {
				return { success: false as const, error: 'already_archived' as const };
			}

			if (row.status !== 'published') {
				return { success: false as const, error: 'not_published' as const };
			}

			const episodes = selectEpisodeSlottings(db, input.missionId);
			const baseSlotting = parseCanonicalSlotting(row.slotting_json);
			const seenSideIds = new Set<string>();
			const allSides: typeof baseSlotting.sides = [];
			for (const ep of episodes) {
				for (const side of ep.slotting.sides) {
					if (!seenSideIds.has(side.id)) {
						seenSideIds.add(side.id);
						allSides.push(side);
					}
				}
			}
			if (allSides.length === 0) {
				for (const side of baseSlotting.sides) allSides.push(side);
			}
			const archiveResult = normalizeArchiveCompletedResult({ slotting: { sides: allSides }, result: input.result });
			if (!archiveResult) {
				return { success: false as const, error: 'archive_result_invalid' as const };
			}

			const updatedInfo = archiveMission.run(
				JSON.stringify(archiveResult),
				input.archivedBySteamId64,
				input.archivedBySteamId64,
				input.missionId
			);
			if (updatedInfo.changes === 0) {
				const fresh = selectMission.get(input.missionId) as MissionRow | undefined;
				if (!fresh) {
					return { success: false as const, error: 'not_found' as const };
				}
				if (fresh.status === 'archived') {
					return { success: false as const, error: 'already_archived' as const };
				}
				return { success: false as const, error: 'database_error' as const };
			}

			const updated = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!updated) {
				return { success: false as const, error: 'database_error' as const };
			}

			insertAudit.run(
				input.missionId,
				input.archivedBySteamId64,
				JSON.stringify({
					shortCode: updated.short_code ?? null,
					archiveStatus: 'completed',
					archiveResult
				})
			);

			return { success: true as const, mission: mapMissionRow(db, updated) };
		});

		return run();
	} catch {
		return { success: false, error: 'database_error' };
	}
}

// ── Mission updates ──────────────────────────────────────────────────

export function createMissionUpdate(input: CreateMissionUpdateRequest & {
	missionId: number;
	createdBySteamId64: string;
}): CreateMissionUpdateRepoResult {
	const db = getDb();
	const selectMission = db.prepare(`
		SELECT ${selectMissionColumns()}
		FROM missions
		WHERE id = ?
		LIMIT 1
	`);
	const insertUpdate = db.prepare(`
		INSERT INTO mission_public_updates (mission_id, kind, episode_number, total_episodes, created_by_steamid64)
		VALUES (?, ?, ?, ?, ?)
	`);
	const insertAudit = db.prepare(`
		INSERT INTO mission_audit_events (mission_id, actor_steamid64, event_type, payload)
		VALUES (?, ?, 'mission.public_update.created', ?)
	`);

	try {
		const run = db.transaction((): CreateMissionUpdateRepoResult => {
			const row = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!row) {
				return { success: false, error: 'not_found' };
			}

			if (row.status !== 'published') {
				return { success: false, error: 'not_published' };
			}

			insertUpdate.run(input.missionId, input.kind, input.episodeNumber, input.totalEpisodes, input.createdBySteamId64);
			insertAudit.run(
				input.missionId,
				input.createdBySteamId64,
				JSON.stringify({
					kind: input.kind,
					episodeNumber: input.episodeNumber,
					totalEpisodes: input.totalEpisodes,
					shortCode: row.short_code ?? null
				})
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

export function updateMissionUpdate(input: CreateMissionUpdateRequest & {
	missionId: number;
	updateId: number;
	updatedBySteamId64: string;
}): UpdateMissionUpdateRepoResult {
	const db = getDb();
	const selectMission = db.prepare(`
		SELECT ${selectMissionColumns()}
		FROM missions
		WHERE id = ?
		LIMIT 1
	`);
	const updateExisting = db.prepare(`
		UPDATE mission_public_updates
		SET kind = ?, episode_number = ?, total_episodes = ?
		WHERE id = ? AND mission_id = ?
	`);
	const insertAudit = db.prepare(`
		INSERT INTO mission_audit_events (mission_id, actor_steamid64, event_type, payload)
		VALUES (?, ?, 'mission.public_update.updated', ?)
	`);

	try {
		const run = db.transaction(() => {
			const row = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!row) {
				return { success: false as const, error: 'not_found' as const };
			}

			if (row.status !== 'published') {
				return { success: false as const, error: 'not_published' as const };
			}

			const result = updateExisting.run(
				input.kind,
				input.episodeNumber,
				input.totalEpisodes,
				input.updateId,
				input.missionId
			);
			if (result.changes < 1) {
				return { success: false as const, error: 'not_found' as const };
			}

			insertAudit.run(
				input.missionId,
				input.updatedBySteamId64,
				JSON.stringify({
					updateId: input.updateId,
					kind: input.kind,
					episodeNumber: input.episodeNumber,
					totalEpisodes: input.totalEpisodes,
					shortCode: row.short_code ?? null
				})
			);

			const updated = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!updated) {
				return { success: false as const, error: 'database_error' as const };
			}

			return { success: true as const, mission: mapMissionRow(db, updated) };
		});

		return run();
	} catch {
		return { success: false, error: 'database_error' };
	}
}

// ── Game cancellation ────────────────────────────────────────────────

export function cancelGame(input: {
	missionId: number;
	archivedBySteamId64: string;
	reason: string;
}): import('@/features/games/ports').CancelGameRepoResult {
	const db = getDb();
	const selectMission = db.prepare(`
		SELECT ${selectMissionColumns()}
		FROM missions
		WHERE id = ?
		LIMIT 1
	`);
	const cancelMission = db.prepare(`
		UPDATE missions
		SET status = 'archived',
			archived_at = CURRENT_TIMESTAMP,
			archive_status = 'canceled',
			archive_reason = ?,
			archive_result_json = NULL,
			priority_claim_manual_state = 'closed',
			regular_join_enabled = 0,
			image_data = NULL,
			image_mime = NULL,
			updated_at = CURRENT_TIMESTAMP,
			updated_by_steamid64 = ?,
			archived_by_steamid64 = ?
		WHERE id = ? AND status = 'published'
	`);
	const insertAudit = db.prepare(`
		INSERT INTO mission_audit_events (mission_id, actor_steamid64, event_type, payload)
		VALUES (?, ?, 'mission.canceled', ?)
	`);

	try {
		const run = db.transaction(() => {
			const row = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!row) {
				return { success: false as const, error: 'not_found' as const };
			}

			if (row.status === 'archived') {
				return { success: false as const, error: 'already_archived' as const };
			}

			if (row.status !== 'published') {
				return { success: false as const, error: 'not_published' as const };
			}

			if (!input.reason.trim()) {
				return { success: false as const, error: 'cancel_reason_required' as const };
			}

			const updatedInfo = cancelMission.run(
				input.reason.trim(),
				input.archivedBySteamId64,
				input.archivedBySteamId64,
				input.missionId
			);
			if (updatedInfo.changes === 0) {
				const fresh = selectMission.get(input.missionId) as MissionRow | undefined;
				if (!fresh) {
					return { success: false as const, error: 'not_found' as const };
				}
				if (fresh.status === 'archived') {
					return { success: false as const, error: 'already_archived' as const };
				}
				return { success: false as const, error: 'database_error' as const };
			}

			const updated = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!updated) {
				return { success: false as const, error: 'database_error' as const };
			}

			insertAudit.run(
				input.missionId,
				input.archivedBySteamId64,
				JSON.stringify({
					shortCode: updated.short_code ?? null,
					archiveStatus: 'canceled',
					reason: input.reason.trim()
				})
			);

			return { success: true as const, mission: mapMissionRow(db, updated) };
		});

		return run();
	} catch {
		return { success: false, error: 'database_error' };
	}
}

// ── Delete archived ──────────────────────────────────────────────────

export function deleteArchivedMission(
	input: DeleteArchivedMissionRequest & { missionId: number }
): DeleteArchivedMissionRepoResult {
	const db = getDb();
	const selectMission = db.prepare(`
		SELECT ${selectMissionColumns()}
		FROM missions
		WHERE id = ?
		LIMIT 1
	`);
	const deleteMission = db.prepare(`
		DELETE FROM missions
		WHERE id = ? AND status = 'archived'
	`);

	try {
		const run = db.transaction(() => {
			const row = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!row) {
				return { success: false as const, error: 'not_found' as const };
			}

			if (row.status !== 'archived') {
				return { success: false as const, error: 'not_archived' as const };
			}

			if (row.title !== input.titleConfirmation) {
				return { success: false as const, error: 'title_confirmation_mismatch' as const };
			}

			const deleted = deleteMission.run(input.missionId);
			if (deleted.changes === 0) {
				const fresh = selectMission.get(input.missionId) as MissionRow | undefined;
				if (!fresh) {
					return { success: false as const, error: 'not_found' as const };
				}
				if (fresh.status !== 'archived') {
					return { success: false as const, error: 'not_archived' as const };
				}
				return { success: false as const, error: 'database_error' as const };
			}

			return { success: true as const };
		});

		return run();
	} catch {
		return { success: false, error: 'database_error' };
	}
}

// ── Audit history ────────────────────────────────────────────────────

export function getMissionAuditHistory(input: { missionId: number }): GetMissionAuditRepoResult {
	const db = getDb();
	const missionExists = db
		.prepare(`
			SELECT 1
			FROM missions
			WHERE id = ?
			LIMIT 1
		`)
		.get(input.missionId) as { 1?: number } | undefined;

	if (!missionExists) {
		return { success: false, error: 'not_found' };
	}

	try {
		const rows = db
			.prepare(`
				SELECT mae.id,
					mae.event_type,
					mae.created_at,
					mae.actor_user_id,
					mae.actor_steamid64,
					COALESCE(u_by_id.current_callsign, u_by_steam.current_callsign) AS actor_callsign,
					mae.payload
				FROM mission_audit_events mae
				LEFT JOIN users u_by_id ON u_by_id.id = mae.actor_user_id
				LEFT JOIN user_identities ui_steam
					ON ui_steam.provider = 'steam'
					AND ui_steam.provider_user_id = mae.actor_steamid64
				LEFT JOIN users u_by_steam ON u_by_steam.id = ui_steam.user_id
				WHERE mae.mission_id = ?
				ORDER BY mae.created_at DESC, mae.id DESC
			`)
			.all(input.missionId) as MissionAuditRow[];

		return {
			success: true,
			events: rows.map((row) => ({
				id: row.id,
				eventType: row.event_type,
				createdAt: row.created_at,
				actorUserId: row.actor_user_id ?? null,
				actorSteamId64: row.actor_steamid64 ?? null,
				actorCallsign: row.actor_callsign ?? null,
				payload: parseAuditPayload(row.payload)
			}))
		};
	} catch {
		return { success: false, error: 'database_error' };
	}
}

// ── Viewer/public queries ────────────────────────────────────────────

export function getGameByShortCode(input: {
	shortCode: string;
	steamId64: string;
}): GetGameByShortCodeRepoResult {
	const db = getDb();
	const row = db
		.prepare(`
			SELECT ${selectMissionColumns()}
			FROM missions
			WHERE status IN ('published', 'archived') AND short_code IS NOT NULL AND LOWER(short_code) = LOWER(?)
			LIMIT 1
		`)
		.get(input.shortCode) as MissionRow | undefined;

	if (!row?.short_code) {
		return { success: false, error: 'not_found' };
	}
	if (row.status !== 'published' && row.status !== 'archived') {
		return { success: false, error: 'not_found' };
	}
	const missionRow = row as MissionRow & { status: 'published' | 'archived' };

	try {
		const viewer = getMissionParticipationUser(db, input.steamId64);
		if (!viewer) {
			return { success: false, error: 'database_error' };
		}

		return {
			success: true,
			mission: mapMissionDetailForViewer({ db, row: missionRow, viewer, steamId64: input.steamId64 })
		};
	} catch {
		return { success: false, error: 'database_error' };
	}
}

export function getArchivedGameSummaries(): GetGameArchiveSummariesRepoResult {
	const db = getDb();

	try {
		const rows = db
			.prepare(`
				SELECT ${selectMissionColumns()}
				FROM missions
				WHERE status = 'archived'
				ORDER BY COALESCE(archived_at, updated_at) DESC, id DESC
			`)
			.all() as MissionRow[];

		return {
			success: true,
			archive: rows
				.map((row) => mapArchiveSummaryRow(row))
				.filter((mission): mission is GameArchiveSummary => mission !== null)
		};
	} catch {
		return { success: false, error: 'database_error' };
	}
}

export function pruneOldAuditEvents(maxAgeDays: number = 30): number {
	const db = getDb();
	const result = db.prepare(`
		DELETE FROM mission_audit_events
		WHERE created_at < datetime('now', '-' || ? || ' days')
	`).run(maxAgeDays);
	return result.changes;
}

export function getCurrentPublishedSummary(): CurrentGameSummary | null {
	const db = getDb();
	const row = db
		.prepare(`
			SELECT short_code, title, description, starts_at
			FROM missions
			WHERE status = 'published'
			LIMIT 1
		`)
		.get() as
		| {
				short_code: string | null;
				title: string;
				description: string;
				starts_at: string | null;
		  }
		| undefined;

	if (!row?.short_code) {
		return null;
	}

	return {
		shortCode: row.short_code,
		title: row.title,
		description: parseLocalizedDescription(row.description),
		startsAt: row.starts_at ?? null
	};
}

export function setMissionImage(
	missionId: number,
	data: string,
	mime: string
): { success: true } | { success: false; error: 'not_found' | 'database_error' } {
	const db = getDb();
	try {
		const result = db.prepare(`
			UPDATE missions
			SET image_data = ?, image_mime = ?, updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
			WHERE id = ?
		`).run(data, mime, missionId);
		if (result.changes === 0) return { success: false, error: 'not_found' };
		return { success: true };
	} catch {
		return { success: false, error: 'database_error' };
	}
}

export function getMissionImage(missionId: number): { data: string; mime: string } | null {
	const db = getDb();
	const row = db.prepare('SELECT image_data, image_mime FROM missions WHERE id = ? AND image_data IS NOT NULL').get(missionId) as
		{ image_data: string; image_mime: string } | undefined;
	return row ? { data: row.image_data, mime: row.image_mime } : null;
}

export function deleteMissionImage(missionId: number): { success: true } | { success: false; error: 'not_found' | 'database_error' } {
	const db = getDb();
	try {
		const result = db.prepare(`
			UPDATE missions
			SET image_data = NULL, image_mime = NULL, updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
			WHERE id = ?
		`).run(missionId);
		if (result.changes === 0) return { success: false, error: 'not_found' };
		return { success: true };
	} catch {
		return { success: false, error: 'database_error' };
	}
}

export type PendingPriorityNotification = {
	missionId: number;
	title: string;
	shortCode: string;
	startsAt: string;
	discordRoleIds: string[];
};

export function claimPendingPriorityDiscordNotifications(): PendingPriorityNotification[] {
	const db = getDb();
	const now = new Date().toISOString();

	const rows = db.prepare(`
		SELECT id, title, short_code, starts_at
		FROM missions
		WHERE status = 'published'
			AND priority_discord_sent = 0
			AND skip_priority_discord = 0
			AND (
				priority_claim_manual_state = 'open'
				OR (priority_claim_manual_state = 'default' AND priority_claim_opens_at IS NOT NULL AND priority_claim_opens_at <= ?)
			)
	`).all(now) as Array<{ id: number; title: string; short_code: string; starts_at: string }>;

	if (rows.length === 0) return [];

	const markSent = db.prepare(`UPDATE missions SET priority_discord_sent = 1 WHERE id = ?`);
	const selectRoleIds = db.prepare(`
		SELECT bt.discord_role_id
		FROM mission_priority_badges mpb
		JOIN badge_types bt ON bt.id = mpb.badge_type_id
		WHERE mpb.mission_id = ? AND bt.discord_role_id IS NOT NULL
	`);
	const markAll = db.transaction(() => {
		for (const row of rows) {
			markSent.run(row.id);
		}
	});
	markAll();

	return rows.map((row) => {
		const roleRows = selectRoleIds.all(row.id) as Array<{ discord_role_id: string }>;
		return {
			missionId: row.id,
			title: row.title,
			shortCode: row.short_code,
			startsAt: row.starts_at,
			discordRoleIds: roleRows.map((r) => r.discord_role_id),
		};
	});
}
