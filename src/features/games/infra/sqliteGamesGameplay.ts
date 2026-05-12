import type {
	ReleasePriorityGameplayRepoResult,
	ReleaseRegularGameplayRepoResult,
	ReleaseUnitGameplayRepoResult,
	HidePriorityGameplayRepoResult,
	HideRegularGameplayRepoResult,
	HideUnitGameplayRepoResult
} from '@/features/games/ports';
import { getDb } from '@/platform/db/connection';
import {
	isNonEmptyText,
	mapMissionRow,
	selectMissionColumns,
	type MissionRow
} from './sqliteGamesShared';

// ── Unit gameplay ────────────────────────────────────────────────────

export function releaseUnitGameplay(input: {
	missionId: number;
	releasedBySteamId64: string;
}): ReleaseUnitGameplayRepoResult {
	const db = getDb();
	const selectMission = db.prepare(`
		SELECT ${selectMissionColumns()}
		FROM missions
		WHERE id = ?
		LIMIT 1
	`);
	const releaseMission = db.prepare(`
		UPDATE missions
		SET unit_gameplay_released_at = CURRENT_TIMESTAMP,
			unit_gameplay_ever_released = 1,
			unit_slotting_manual_state = 'closed',
			updated_at = CURRENT_TIMESTAMP,
			updated_by_steamid64 = ?
		WHERE id = ? AND unit_gameplay_released_at IS NULL
	`);
	const insertAudit = db.prepare(`
		INSERT INTO mission_audit_events (mission_id, actor_steamid64, event_type, payload)
		VALUES (?, ?, 'mission.unit_gameplay.released', ?)
	`);

	try {
		const run = db.transaction((): ReleaseUnitGameplayRepoResult => {
			const row = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!row) {
				return { success: false, error: 'not_found' };
			}

			if (row.status !== 'published') {
				return { success: false, error: 'not_published' };
			}

			if (!isNonEmptyText(row.final_password)) {
				return { success: false, error: 'final_password_required' };
			}

			if (row.unit_gameplay_released_at) {
				return { success: false, error: 'already_released' };
			}

			const updatedInfo = releaseMission.run(input.releasedBySteamId64, input.missionId);
			if (updatedInfo.changes === 0) {
				return { success: false, error: 'already_released' };
			}

			const updated = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!updated) {
				return { success: false, error: 'database_error' };
			}

			insertAudit.run(
				input.missionId,
				input.releasedBySteamId64,
				JSON.stringify({ shortCode: updated.short_code ?? null })
			);

			return { success: true, mission: mapMissionRow(db, updated) };
		});

		return run();
	} catch {
		return { success: false, error: 'database_error' };
	}
}

export function hideUnitGameplay(input: {
	missionId: number;
	hiddenBySteamId64: string;
}): HideUnitGameplayRepoResult {
	const db = getDb();
	const selectMission = db.prepare(`
		SELECT ${selectMissionColumns()}
		FROM missions
		WHERE id = ?
		LIMIT 1
	`);
	const hideMission = db.prepare(`
		UPDATE missions
		SET unit_gameplay_released_at = NULL,
			updated_at = CURRENT_TIMESTAMP,
			updated_by_steamid64 = ?
		WHERE id = ? AND unit_gameplay_released_at IS NOT NULL
	`);
	const insertAudit = db.prepare(`
		INSERT INTO mission_audit_events (mission_id, actor_steamid64, event_type, payload)
		VALUES (?, ?, 'mission.unit_gameplay.hidden', ?)
	`);

	try {
		const run = db.transaction((): HideUnitGameplayRepoResult => {
			const row = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!row) {
				return { success: false, error: 'not_found' };
			}

			if (row.status !== 'published') {
				return { success: false, error: 'not_published' };
			}

			if (row.priority_gameplay_released_at) {
				return { success: false, error: 'priority_release_hide_required' };
			}

			if (!row.unit_gameplay_released_at) {
				return { success: false, error: 'already_hidden' };
			}

			const updatedInfo = hideMission.run(input.hiddenBySteamId64, input.missionId);
			if (updatedInfo.changes === 0) {
				return { success: false, error: 'already_hidden' };
			}

			const updated = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!updated) {
				return { success: false, error: 'database_error' };
			}

			insertAudit.run(
				input.missionId,
				input.hiddenBySteamId64,
				JSON.stringify({ shortCode: updated.short_code ?? null })
			);

			return { success: true, mission: mapMissionRow(db, updated) };
		});

		return run();
	} catch {
		return { success: false, error: 'database_error' };
	}
}

// ── Priority gameplay ────────────────────────────────────────────────

export function releasePriorityGameplay(input: {
	missionId: number;
	releasedBySteamId64: string;
}): ReleasePriorityGameplayRepoResult {
	const db = getDb();
	const selectMission = db.prepare(`
		SELECT ${selectMissionColumns()}
		FROM missions
		WHERE id = ?
		LIMIT 1
	`);
	const releaseMission = db.prepare(`
		UPDATE missions
		SET priority_gameplay_released_at = CURRENT_TIMESTAMP,
			priority_gameplay_ever_released = 1,
			priority_claim_manual_state = 'closed',
			unit_slotting_manual_state = 'closed',
			regular_join_enabled = 0,
			updated_at = CURRENT_TIMESTAMP,
			updated_by_steamid64 = ?
		WHERE id = ? AND priority_gameplay_released_at IS NULL
	`);
	const insertAudit = db.prepare(`
		INSERT INTO mission_audit_events (mission_id, actor_steamid64, event_type, payload)
		VALUES (?, ?, 'mission.priority_gameplay.released', ?)
	`);

	try {
		const run = db.transaction((): ReleasePriorityGameplayRepoResult => {
			const row = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!row) {
				return { success: false, error: 'not_found' };
			}

			if (row.status !== 'published') {
				return { success: false, error: 'not_published' };
			}

			if (!isNonEmptyText(row.final_password)) {
				return { success: false, error: 'final_password_required' };
			}

			if (row.priority_gameplay_released_at) {
				return { success: false, error: 'already_released' };
			}

			const updatedInfo = releaseMission.run(input.releasedBySteamId64, input.missionId);
			if (updatedInfo.changes === 0) {
				const fresh = selectMission.get(input.missionId) as MissionRow | undefined;
				if (!fresh) {
					return { success: false, error: 'not_found' };
				}
				if (fresh.priority_gameplay_released_at) {
					return { success: false, error: 'already_released' };
				}
				return { success: false, error: 'database_error' };
			}

			const updated = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!updated) {
				return { success: false, error: 'database_error' };
			}

			insertAudit.run(
				input.missionId,
				input.releasedBySteamId64,
				JSON.stringify({ shortCode: updated.short_code ?? null })
			);

			return { success: true, mission: mapMissionRow(db, updated) };
		});

		return run();
	} catch {
		return { success: false, error: 'database_error' };
	}
}

export function hidePriorityGameplay(input: {
	missionId: number;
	hiddenBySteamId64: string;
}): HidePriorityGameplayRepoResult {
	const db = getDb();
	const selectMission = db.prepare(`
		SELECT ${selectMissionColumns()}
		FROM missions
		WHERE id = ?
		LIMIT 1
	`);
	const hideMission = db.prepare(`
		UPDATE missions
		SET priority_gameplay_released_at = NULL,
			updated_at = CURRENT_TIMESTAMP,
			updated_by_steamid64 = ?
		WHERE id = ? AND priority_gameplay_released_at IS NOT NULL
	`);
	const insertAudit = db.prepare(`
		INSERT INTO mission_audit_events (mission_id, actor_steamid64, event_type, payload)
		VALUES (?, ?, 'mission.priority_gameplay.hidden', ?)
	`);

	try {
		const run = db.transaction((): HidePriorityGameplayRepoResult => {
			const row = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!row) {
				return { success: false, error: 'not_found' };
			}

			if (row.status !== 'published') {
				return { success: false, error: 'not_published' };
			}

			if (row.regular_gameplay_released_at) {
				return { success: false, error: 'regular_release_hide_required' };
			}

			if (!row.priority_gameplay_released_at) {
				return { success: false, error: 'already_hidden' };
			}

			const updatedInfo = hideMission.run(input.hiddenBySteamId64, input.missionId);
			if (updatedInfo.changes === 0) {
				const fresh = selectMission.get(input.missionId) as MissionRow | undefined;
				if (!fresh) {
					return { success: false, error: 'not_found' };
				}
				if (!fresh.priority_gameplay_released_at) {
					return { success: false, error: 'already_hidden' };
				}
				return { success: false, error: 'database_error' };
			}

			const updated = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!updated) {
				return { success: false, error: 'database_error' };
			}

			insertAudit.run(
				input.missionId,
				input.hiddenBySteamId64,
				JSON.stringify({ shortCode: updated.short_code ?? null })
			);

			return { success: true, mission: mapMissionRow(db, updated) };
		});

		return run();
	} catch {
		return { success: false, error: 'database_error' };
	}
}

// ── Regular gameplay ─────────────────────────────────────────────────

export function releaseRegularGameplay(input: {
	missionId: number;
	releasedBySteamId64: string;
}): ReleaseRegularGameplayRepoResult {
	const db = getDb();
	const selectMission = db.prepare(`
		SELECT ${selectMissionColumns()}
		FROM missions
		WHERE id = ?
		LIMIT 1
	`);
	const snapshotCurrentJoins = db.prepare(`
		INSERT OR IGNORE INTO mission_regular_release_snapshot (mission_id, user_id, released_at)
		SELECT mission_id, user_id, CURRENT_TIMESTAMP
		FROM mission_regular_joins
		WHERE mission_id = ?
	`);
	const releaseMission = db.prepare(`
		UPDATE missions
		SET regular_gameplay_released_at = CURRENT_TIMESTAMP,
			regular_gameplay_ever_released = 1,
			unit_slotting_manual_state = 'closed',
			updated_at = CURRENT_TIMESTAMP,
			updated_by_steamid64 = ?
		WHERE id = ? AND regular_gameplay_released_at IS NULL
	`);
	const insertAudit = db.prepare(`
		INSERT INTO mission_audit_events (mission_id, actor_steamid64, event_type, payload)
		VALUES (?, ?, 'mission.regular_gameplay.released', ?)
	`);

	try {
		const run = db.transaction((): ReleaseRegularGameplayRepoResult => {
			const row = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!row) {
				return { success: false, error: 'not_found' };
			}

			if (row.status !== 'published') {
				return { success: false, error: 'not_published' };
			}

			if (!row.priority_gameplay_released_at) {
				return { success: false, error: 'priority_release_required' };
			}

			if (!isNonEmptyText(row.final_password)) {
				return { success: false, error: 'final_password_required' };
			}

			if (row.regular_gameplay_released_at) {
				return { success: false, error: 'already_released' };
			}

			const snapshotInfo = snapshotCurrentJoins.run(input.missionId);
			const updatedInfo = releaseMission.run(input.releasedBySteamId64, input.missionId);
			if (updatedInfo.changes === 0) {
				const fresh = selectMission.get(input.missionId) as MissionRow | undefined;
				if (!fresh) {
					return { success: false, error: 'not_found' };
				}
				if (fresh.regular_gameplay_released_at) {
					return { success: false, error: 'already_released' };
				}
				return { success: false, error: 'database_error' };
			}

			const updated = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!updated) {
				return { success: false, error: 'database_error' };
			}

			insertAudit.run(
				input.missionId,
				input.releasedBySteamId64,
				JSON.stringify({
					shortCode: updated.short_code ?? null,
					recipientCount: snapshotInfo.changes
				})
			);

			return { success: true, mission: mapMissionRow(db, updated) };
		});

		return run();
	} catch {
		return { success: false, error: 'database_error' };
	}
}

export function hideRegularGameplay(input: {
	missionId: number;
	hiddenBySteamId64: string;
}): HideRegularGameplayRepoResult {
	const db = getDb();
	const selectMission = db.prepare(`
		SELECT ${selectMissionColumns()}
		FROM missions
		WHERE id = ?
		LIMIT 1
	`);
	const hideMission = db.prepare(`
		UPDATE missions
		SET regular_gameplay_released_at = NULL,
			updated_at = CURRENT_TIMESTAMP,
			updated_by_steamid64 = ?
		WHERE id = ? AND regular_gameplay_released_at IS NOT NULL
	`);
	const insertAudit = db.prepare(`
		INSERT INTO mission_audit_events (mission_id, actor_steamid64, event_type, payload)
		VALUES (?, ?, 'mission.regular_gameplay.hidden', ?)
	`);

	try {
		const run = db.transaction((): HideRegularGameplayRepoResult => {
			const row = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!row) {
				return { success: false, error: 'not_found' };
			}

			if (row.status !== 'published') {
				return { success: false, error: 'not_published' };
			}

			if (!row.regular_gameplay_released_at) {
				return { success: false, error: 'already_hidden' };
			}

			const updatedInfo = hideMission.run(input.hiddenBySteamId64, input.missionId);
			if (updatedInfo.changes === 0) {
				const fresh = selectMission.get(input.missionId) as MissionRow | undefined;
				if (!fresh) {
					return { success: false, error: 'not_found' };
				}
				if (!fresh.regular_gameplay_released_at) {
					return { success: false, error: 'already_hidden' };
				}
				return { success: false, error: 'database_error' };
			}

			const updated = selectMission.get(input.missionId) as MissionRow | undefined;
			if (!updated) {
				return { success: false, error: 'database_error' };
			}

			insertAudit.run(
				input.missionId,
				input.hiddenBySteamId64,
				JSON.stringify({ shortCode: updated.short_code ?? null })
			);

			return { success: true, mission: mapMissionRow(db, updated) };
		});

		return run();
	} catch {
		return { success: false, error: 'database_error' };
	}
}
