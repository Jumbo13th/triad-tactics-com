import {
	autoConvertUnclaimedSlots,
	countUnitSlotsUsed,
	hasPrioritySlots,
	parseCanonicalSlotting
} from '@/features/games/domain/slotting';
import type {
	GameAdminMission,
	GameArchiveResult,
	GameArchiveSummary,
	GameAuditEvent,
	GameMissionDetail,
	GameMissionPassword,
	GameMissionUpdate,
	GamePriorityClaimManualState,
	GamePublishValidationError,
	GameRegularJoinParticipant,
	GameUnitAssignment,
	LocalizedDescription
} from '@/features/games/domain/types';
import { appLocales } from '@/i18n/locales';
import { getDb } from '@/platform/db/connection';
import { slottingEventBus } from '@/platform/sse/eventBus';

export type DbConnection = ReturnType<typeof getDb>;

export type MissionRow = {
	id: number;
	short_code: string | null;
	status: 'draft' | 'published' | 'archived';
	title: string;
	description: string;
	starts_at: string | null;
	server_name: string;
	server_host: string;
	server_port: number | null;
	early_password: string | null;
	final_password: string | null;
	server_details_hidden: number | boolean;
	priority_claim_opens_at: string | null;
	priority_claim_manual_state: GamePriorityClaimManualState;
	regular_join_enabled: number | boolean;
	priority_gameplay_released_at: string | null;
	regular_gameplay_released_at: string | null;
	priority_gameplay_ever_released: number | boolean;
	regular_gameplay_ever_released: number | boolean;
	published_at: string | null;
	archived_at: string | null;
	archive_status: import('@/features/games/domain/types').GameArchiveStatus | null;
	archive_reason: string | null;
	archive_result_json: string | null;
	created_at: string;
	updated_at: string;
	created_by_steamid64: string | null;
	updated_by_steamid64: string | null;
	published_by_steamid64: string | null;
	archived_by_steamid64: string | null;
	slotting_revision: number;
	settings_revision: number;
	slotting_json: string;
	unit_slotting_manual_state: 'closed' | 'open';
	unit_gameplay_released_at: string | null;
	unit_gameplay_ever_released: number | boolean;
};

export type MissionParticipationUserRow = {
	id: number;
	current_callsign: string | null;
};

export type MissionAuditRow = {
	id: number;
	event_type: string;
	created_at: string;
	actor_user_id: number | null;
	actor_steamid64: string | null;
	actor_callsign: string | null;
	payload: string;
};

export type MissionUpdateRow = {
	id: number;
	kind: GameMissionUpdate['kind'];
	episode_number: number | null;
	total_episodes: number | null;
	created_at: string;
	created_by_steamid64: string | null;
};
export function isNonEmptyText(value: string | null | undefined): boolean {
	return typeof value === 'string' && value.trim() !== '';
}

export const emptyLocalizedDescription: LocalizedDescription = Object.fromEntries(
	appLocales.map((locale) => [locale, ''])
) as LocalizedDescription;

export function parseLocalizedDescription(raw: string): LocalizedDescription {
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return Object.fromEntries(
				appLocales.map((locale) => [locale, typeof parsed[locale] === 'string' ? parsed[locale] : ''])
			) as LocalizedDescription;
		}
	} catch {}
	return { ...emptyLocalizedDescription, en: raw };
}

export function parseAuditPayload(raw: string): GameAuditEvent['payload'] {
	try {
		return JSON.parse(raw) as GameAuditEvent['payload'];
	} catch {
		return raw;
	}
}

export function isSqliteConstraintError(error: unknown, needle: string): boolean {
	return error instanceof Error && error.message.includes(needle);
}

export function resolvePasswordUpdate(
	currentValue: string | null,
	nextValue: string | null | undefined
): string | null {
	if (nextValue === undefined) {
		return currentValue;
	}
	return nextValue;
}
export function emitSlottingUpdated(shortCode: string | null, slottingRevision: number): void {
	if (!shortCode) return;
	slottingEventBus.emit({
		type: 'slotting_updated',
		shortCode,
		slottingRevision,
		timestamp: new Date().toISOString()
	});
}
export function selectMissionColumns() {
	return `
		id,
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
		server_details_hidden,
		priority_claim_opens_at,
		priority_claim_manual_state,
		regular_join_enabled,
		priority_gameplay_released_at,
		regular_gameplay_released_at,
		priority_gameplay_ever_released,
		regular_gameplay_ever_released,
		published_at,
		archived_at,
		archive_status,
		archive_reason,
		archive_result_json,
		created_at,
		updated_at,
		created_by_steamid64,
		updated_by_steamid64,
		published_by_steamid64,
		archived_by_steamid64,
		slotting_revision,
		settings_revision,
		slotting_json,
		unit_slotting_manual_state,
		unit_gameplay_released_at,
		unit_gameplay_ever_released
	`;
}

export function selectPriorityBadgeTypeIds(db: DbConnection, missionId: number): number[] {
	const rows = db
		.prepare(`
			SELECT badge_type_id
			FROM mission_priority_badges
			WHERE mission_id = ?
			ORDER BY badge_type_id ASC
		`)
		.all(missionId) as Array<{ badge_type_id: number }>;

	return rows.map((row) => row.badge_type_id);
}

export function selectMissionUpdates(db: DbConnection, missionId: number): GameMissionUpdate[] {
	const rows = db.prepare(`
		SELECT id, kind, episode_number, total_episodes, created_at, created_by_steamid64
		FROM mission_public_updates
		WHERE mission_id = ?
		ORDER BY created_at DESC, id DESC
		LIMIT 20
	`).all(missionId) as MissionUpdateRow[];

	return rows.map((row) => ({
		id: row.id,
		kind: row.kind,
		episodeNumber: row.episode_number ?? null,
		totalEpisodes: row.total_episodes ?? null,
		createdAt: row.created_at,
		createdBySteamId64: row.created_by_steamid64 ?? null
	}));
}

export function selectMissionUnitAssignments(db: DbConnection, missionId: number): GameUnitAssignment[] {
	const rows = db
		.prepare(`
			SELECT mua.unit_id, mua.side_id, u.tag, u.name, u.slots_allocated
			FROM mission_unit_assignments mua
			JOIN units u ON u.id = mua.unit_id
			WHERE mua.mission_id = ?
			ORDER BY u.tag ASC
		`)
		.all(missionId) as Array<{
			unit_id: number;
			side_id: string;
			tag: string;
			name: string;
			slots_allocated: number;
		}>;

	return rows.map((row) => ({
		unitId: row.unit_id,
		unitTag: row.tag,
		unitName: row.name,
		sideId: row.side_id,
		slotsAllocated: row.slots_allocated
	}));
}

export function selectMissionRegularJoiners(db: DbConnection, missionId: number): GameRegularJoinParticipant[] {
	const rows = db
		.prepare(`
			SELECT mrj.user_id, mrj.joined_at,
				COALESCE(u.current_callsign, 'Steam_' || ui.provider_user_id) AS callsign
			FROM mission_regular_joins mrj
			JOIN users u ON u.id = mrj.user_id
			LEFT JOIN user_identities ui
				ON ui.user_id = u.id AND ui.provider = 'steam'
			WHERE mrj.mission_id = ?
			ORDER BY mrj.joined_at ASC, mrj.user_id ASC
		`)
		.all(missionId) as Array<{ user_id: number; joined_at: string; callsign: string | null }>;

	return rows.map((row) => ({
		userId: row.user_id,
		callsign: row.callsign?.trim() || `Steam_${row.user_id}`,
		joinedAt: row.joined_at
	}));
}
export function parseStoredArchiveResult(raw: string | null): GameArchiveResult | null {
	if (!raw) return null;

	try {
		const parsed = JSON.parse(raw) as Record<string, unknown> | null;
		if (!parsed || (parsed.outcome !== 'winner' && parsed.outcome !== 'draw')) {
			return null;
		}
		const rawScores = Array.isArray(parsed.sideScores) ? parsed.sideScores as Record<string, unknown>[] : [];
		const sideScores = rawScores
			.filter(
				(score): score is Record<string, unknown> & { sideId: string; score: number } =>
					typeof score?.sideId === 'string' &&
					typeof score?.score === 'number' &&
					Number.isInteger(score.score) &&
					score.score >= 0
			)
			.map((score) => ({
				sideId: score.sideId,
				sideName: typeof score.sideName === 'string' ? score.sideName : score.sideId,
				score: score.score
			}));
		const winnerSideId = typeof parsed.winnerSideId === 'string' ? parsed.winnerSideId : null;
		return {
			outcome: parsed.outcome,
			winnerSideId: parsed.outcome === 'winner' ? winnerSideId : null,
			sideScores
		};
	} catch {
		return null;
	}
}

export function mapArchiveSummaryRow(row: MissionRow): GameArchiveSummary | null {
	if (!row.short_code || !row.archive_status) {
		return null;
	}

	return {
		shortCode: row.short_code,
		title: row.title,
		description: parseLocalizedDescription(row.description),
		startsAt: row.starts_at ?? null,
		archivedAt: row.archived_at ?? row.updated_at,
		archiveStatus: row.archive_status,
		archiveReason: row.archive_reason ?? null,
		archiveResult: parseStoredArchiveResult(row.archive_result_json ?? null)
	};
}

export function mapMissionRow(db: DbConnection, row: MissionRow): GameAdminMission {
	return {
		id: row.id,
		shortCode: row.short_code ?? null,
		status: row.status,
		title: row.title,
		description: parseLocalizedDescription(row.description),
		startsAt: row.starts_at ?? null,
		serverName: row.server_name,
		serverHost: row.server_host,
		serverPort: row.server_port ?? null,
		priorityClaimOpensAt: row.priority_claim_opens_at ?? null,
		priorityClaimManualState: row.priority_claim_manual_state,
		regularJoinEnabled: !!row.regular_join_enabled,
		unitGameplayReleasedAt: row.unit_gameplay_released_at ?? null,
		priorityGameplayReleasedAt: row.priority_gameplay_released_at ?? null,
		regularGameplayReleasedAt: row.regular_gameplay_released_at ?? null,
		publishedAt: row.published_at ?? null,
		archivedAt: row.archived_at ?? null,
		archiveStatus: row.archive_status ?? null,
		archiveReason: row.archive_reason ?? null,
		archiveResult: parseStoredArchiveResult(row.archive_result_json ?? null),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		createdBySteamId64: row.created_by_steamid64 ?? null,
		updatedBySteamId64: row.updated_by_steamid64 ?? null,
		publishedBySteamId64: row.published_by_steamid64 ?? null,
		archivedBySteamId64: row.archived_by_steamid64 ?? null,
		slottingRevision: row.slotting_revision,
		settingsRevision: row.settings_revision,
		earlyPassword: row.early_password ?? null,
		finalPassword: row.final_password ?? null,
		serverDetailsHidden: !!row.server_details_hidden,
		priorityBadgeTypeIds: selectPriorityBadgeTypeIds(db, row.id),
		unitSlottingManualState: row.unit_slotting_manual_state,
		unitAssignments: selectMissionUnitAssignments(db, row.id),
		updates: selectMissionUpdates(db, row.id),
		slotting: parseCanonicalSlotting(row.slotting_json)
	};
}

export function mapMissionSettingsAudit(row: MissionRow, priorityBadgeTypeIds: number[]) {
	return {
		shortCode: row.short_code ?? null,
		title: row.title,
		description: parseLocalizedDescription(row.description),
		startsAt: row.starts_at ?? null,
		serverName: row.server_name,
		serverHost: row.server_host,
		serverPort: row.server_port ?? null,
		priorityClaimOpensAt: row.priority_claim_opens_at ?? null,
		priorityClaimManualState: row.priority_claim_manual_state,
		unitSlottingManualState: row.unit_slotting_manual_state,
		regularJoinEnabled: !!row.regular_join_enabled,
		serverDetailsHidden: !!row.server_details_hidden,
		earlyPassword: row.early_password ?? null,
		finalPassword: row.final_password ?? null,
		priorityBadgeTypeIds
	};
}
export function isPriorityClaimOpen(row: MissionRow): boolean {
	if (row.priority_gameplay_released_at || row.priority_gameplay_ever_released) return false;
	if (row.priority_claim_manual_state === 'open') return true;
	if (row.priority_claim_manual_state === 'closed') return false;
	if (!row.priority_claim_opens_at) return false;
	return new Date(row.priority_claim_opens_at).getTime() <= Date.now();
}

export function isRegularJoinOpen(row: MissionRow): boolean {
	if (!row.regular_join_enabled) return false;
	if (row.priority_gameplay_released_at || row.priority_gameplay_ever_released) return false;
	if (row.regular_gameplay_released_at || row.regular_gameplay_ever_released) return false;
	return true;
}
export function findUserHeldSlot(slotting: ReturnType<typeof parseCanonicalSlotting>, userId: number) {
	for (const side of slotting.sides) {
		for (const squad of side.squads) {
			for (const slot of squad.slots) {
				if (slot.occupant?.type === 'user' && slot.occupant.userId === userId) {
					return { side, squad, slot };
				}
			}
		}
	}
	return null;
}

export function findSlotById(slotting: ReturnType<typeof parseCanonicalSlotting>, slotId: string) {
	for (const side of slotting.sides) {
		for (const squad of side.squads) {
			for (const slot of squad.slots) {
				if (slot.id === slotId) {
					return { side, squad, slot };
				}
			}
		}
	}
	return null;
}

export function countAvailablePrioritySlots(slotting: ReturnType<typeof parseCanonicalSlotting>): number {
	let count = 0;
	for (const side of slotting.sides) {
		for (const squad of side.squads) {
			for (const slot of squad.slots) {
				if (slot.access === 'priority' && slot.occupant === null) {
					count += 1;
				}
			}
		}
	}
	return count;
}

/** Reconcile slot access types based on current unit allocations. Only writes if slotting actually changed. */
export function ensureAutoConversion(db: DbConnection, row: MissionRow): void {
	const assignments = selectMissionUnitAssignments(db, row.id);
	const totalUnitAllocated = assignments.reduce((sum, a) => sum + a.slotsAllocated, 0);
	if (totalUnitAllocated === 0) return;

	const currentSlotting = parseCanonicalSlotting(row.slotting_json);
	const converted = autoConvertUnclaimedSlots(currentSlotting, totalUnitAllocated);

	if (converted === null) return; // no changes needed

	db.prepare(`
		UPDATE missions
		SET slotting_json = ?,
			slotting_revision = slotting_revision + 1
		WHERE id = ?
	`).run(JSON.stringify(converted), row.id);
}
export function getMissionParticipationUser(db: DbConnection, steamId64: string): MissionParticipationUserRow | null {
	const row = db
		.prepare(`
			SELECT u.id, u.current_callsign
			FROM user_identities ui
			JOIN users u ON u.id = ui.user_id
			WHERE ui.provider = 'steam' AND ui.provider_user_id = ?
			LIMIT 1
		`)
		.get(steamId64) as MissionParticipationUserRow | undefined;

	return row ?? null;
}

export function userHasMissionPriorityBadge(db: DbConnection, missionId: number, userId: number): boolean {
	const row = db
		.prepare(`
			SELECT 1
			FROM user_badges ub
			JOIN mission_priority_badges mpb
				ON mpb.badge_type_id = ub.badge_type_id
			WHERE ub.user_id = ? AND mpb.mission_id = ?
			LIMIT 1
		`)
		.get(userId, missionId) as { 1?: number } | undefined;

	return !!row;
}

export function selectUserMissionPriorityBadgeLabels(db: DbConnection, missionId: number, userId: number): string[] {
	const rows = db
		.prepare(`
			SELECT DISTINCT bt.label
			FROM user_badges ub
			JOIN mission_priority_badges mpb
				ON mpb.badge_type_id = ub.badge_type_id
			JOIN badge_types bt
				ON bt.id = ub.badge_type_id
			WHERE ub.user_id = ? AND mpb.mission_id = ?
			ORDER BY bt.label COLLATE NOCASE ASC
		`)
		.all(userId, missionId) as Array<{ label: string | null }>;

	return rows
		.map((row) => row.label?.trim() ?? '')
		.filter((label) => label.length > 0);
}

export function userHasMissionRegularGameplayAccess(db: DbConnection, missionId: number, userId: number): boolean {
	const row = db
		.prepare(`
			SELECT 1
			FROM mission_regular_release_snapshot mrrs
			JOIN mission_regular_joins mrj
				ON mrj.mission_id = mrrs.mission_id
				AND mrj.user_id = mrrs.user_id
			WHERE mrrs.mission_id = ? AND mrrs.user_id = ?
			LIMIT 1
		`)
		.get(missionId, userId) as { 1?: number } | undefined;

	return !!row;
}

export function viewerHasUnitGameplayAccess(db: DbConnection, missionId: number, userId: number): boolean {
	const row = db.prepare(`
		SELECT 1 FROM unit_memberships um
		JOIN mission_unit_assignments mua ON mua.unit_id = um.unit_id
		WHERE um.user_id = ? AND um.role = 'member' AND mua.mission_id = ?
		LIMIT 1
	`).get(userId, missionId) as { 1: number } | undefined;
	return row !== undefined;
}
export function resolveMissionPasswordForViewer(input: {
	db: DbConnection;
	row: MissionRow;
	slotting: ReturnType<typeof parseCanonicalSlotting>;
	viewerUserId: number;
	joinedRegular: boolean;
}): GameMissionPassword {
	const heldSlot = findUserHeldSlot(input.slotting, input.viewerUserId);
	const hasUnitGameplayAccess = input.row.unit_gameplay_released_at
		? viewerHasUnitGameplayAccess(input.db, input.row.id, input.viewerUserId)
		: false;
	const hasPriorityGameplayAccess = heldSlot?.slot.access === 'priority';
	const hasRegularGameplayAccess = input.row.regular_gameplay_released_at
		? userHasMissionRegularGameplayAccess(input.db, input.row.id, input.viewerUserId)
		: false;
	const hasFinalGameplayAccess = hasUnitGameplayAccess || hasPriorityGameplayAccess || hasRegularGameplayAccess;
	const missionStarted = input.row.starts_at ? new Date(input.row.starts_at).getTime() <= Date.now() : false;
	const regularJoinOpen = isRegularJoinOpen(input.row);
	const priorityGameplayEverReleased = !!input.row.priority_gameplay_ever_released;
	const regularGameplayEverReleased = !!input.row.regular_gameplay_ever_released;
	const missedJoinWindow =
		(
			input.row.regular_gameplay_released_at !== null &&
			!hasFinalGameplayAccess &&
			!heldSlot
		) ||
		(
			input.row.regular_gameplay_released_at === null &&
			regularGameplayEverReleased &&
			!hasFinalGameplayAccess &&
			!heldSlot &&
			!input.joinedRegular
		) ||
		(
			missionStarted &&
			!hasFinalGameplayAccess &&
			!heldSlot &&
			!input.joinedRegular &&
			!regularJoinOpen &&
			!priorityGameplayEverReleased &&
			!regularGameplayEverReleased
		);

	if (input.row.priority_gameplay_released_at) {
		if (hasFinalGameplayAccess) {
			if (input.row.final_password) {
				return {
					stage: 'final',
					value: input.row.final_password,
					waitingForViewerAccess: false,
					missedJoinWindow: false
				};
			}

			return {
				stage: 'early',
				value: input.row.early_password ?? null,
				waitingForViewerAccess: false,
				missedJoinWindow: false
			};
		}

		if (missedJoinWindow) {
			return {
				stage: null,
				value: null,
				waitingForViewerAccess: false,
				missedJoinWindow: true
			};
		}

		if (!input.row.regular_gameplay_released_at) {
			return {
				stage: null,
				value: null,
				waitingForViewerAccess: true,
				missedJoinWindow: false
			};
		}

		return {
			stage: 'early',
			value: input.row.early_password ?? null,
			waitingForViewerAccess: false,
			missedJoinWindow: false
		};
	}

	if (priorityGameplayEverReleased || regularGameplayEverReleased) {
		if (missedJoinWindow) {
			return {
				stage: null,
				value: null,
				waitingForViewerAccess: false,
				missedJoinWindow: true
			};
		}

		return {
			stage: null,
			value: null,
			waitingForViewerAccess: false,
			missedJoinWindow: false
		};
	}

	if (missedJoinWindow) {
		return {
			stage: null,
			value: null,
			waitingForViewerAccess: false,
			missedJoinWindow: true
		};
	}

	return {
		stage: 'early',
		value: input.row.early_password ?? null,
		waitingForViewerAccess: false,
		missedJoinWindow: false
	};
}

export function mapMissionDetailForViewer(input: {
	db: DbConnection;
	row: MissionRow & { status: 'published' | 'archived' };
	viewer: MissionParticipationUserRow;
	steamId64: string;
}): GameMissionDetail {
	const isPublished = input.row.status === 'published';
	const priorityClaimOpen = isPublished ? isPriorityClaimOpen(input.row) : false;

	// Lazy auto-conversion when priority opens via schedule
	if (priorityClaimOpen) {
		ensureAutoConversion(input.db, input.row);
		const freshRow = input.db.prepare(`SELECT ${selectMissionColumns()} FROM missions WHERE id = ? LIMIT 1`).get(input.row.id) as MissionRow | undefined;
		if (freshRow) input = { ...input, row: { ...freshRow, status: input.row.status } };
	}

	const slotting = parseCanonicalSlotting(input.row.slotting_json);
	const heldSlot = findUserHeldSlot(slotting, input.viewer.id);
	const regularJoiners = selectMissionRegularJoiners(input.db, input.row.id);
	const joinedRegular = regularJoiners.some((joiner) => joiner.userId === input.viewer.id);
	const priorityBadgeLabels = selectUserMissionPriorityBadgeLabels(input.db, input.row.id, input.viewer.id);
	const hasPriorityBadge = priorityBadgeLabels.length > 0;
	const availablePrioritySlotCount = countAvailablePrioritySlots(slotting);
	const regularJoinOpen = isPublished ? isRegularJoinOpen(input.row) : false;
	const unitSlottingOpen = isPublished && input.row.unit_slotting_manual_state === 'open';

	const viewerUnit = input.db.prepare(`
		SELECT u.id AS unit_id, u.tag, u.leader_user_id, u.slots_allocated
		FROM unit_memberships um
		JOIN units u ON u.id = um.unit_id
		WHERE um.user_id = ? AND um.role = 'member'
		LIMIT 1
	`).get(input.viewer.id) as { unit_id: number; tag: string; leader_user_id: number | null; slots_allocated: number } | undefined;

	const viewerIsUnitLeader = viewerUnit != null && viewerUnit.leader_user_id === input.viewer.id;
	const viewerUnitAssignment = viewerUnit
		? (input.db.prepare(`
			SELECT side_id FROM mission_unit_assignments
			WHERE mission_id = ? AND unit_id = ?
		`).get(input.row.id, viewerUnit.unit_id) as { side_id: string } | undefined)
		: undefined;

	const viewerUnitSlotsUsed = viewerUnit ? countUnitSlotsUsed(slotting, viewerUnit.tag) : 0;

	return {
		status: input.row.status,
		shortCode: input.row.short_code ?? '',
		title: input.row.title,
		description: parseLocalizedDescription(input.row.description),
		startsAt: input.row.starts_at ?? null,
		serverName: input.row.server_name,
		serverHost: input.row.server_host,
		serverPort: input.row.server_port ?? null,
		serverDetailsHidden: !!input.row.server_details_hidden,
		priorityClaimOpensAt: input.row.priority_claim_opens_at ?? null,
		priorityClaimManualState: input.row.priority_claim_manual_state,
		priorityClaimOpen,
		unitGameplayReleasedAt: input.row.unit_gameplay_released_at ?? null,
		priorityGameplayReleasedAt: input.row.priority_gameplay_released_at ?? null,
		regularJoinEnabled: !!input.row.regular_join_enabled,
		regularJoinOpen,
		regularGameplayReleasedAt: input.row.regular_gameplay_released_at ?? null,
		unitSlottingOpen,
		slottingRevision: input.row.slotting_revision,
		archivedAt: input.row.archived_at ?? null,
		archiveStatus: input.row.archive_status ?? null,
		archiveReason: input.row.archive_reason ?? null,
		archiveResult: parseStoredArchiveResult(input.row.archive_result_json ?? null),
		availablePrioritySlotCount,
		updates: selectMissionUpdates(input.db, input.row.id),
		slotting,
		regularJoiners,
		password: isPublished
			? resolveMissionPasswordForViewer({
				db: input.db,
				row: input.row,
				slotting,
				viewerUserId: input.viewer.id,
				joinedRegular
			})
			: { stage: null, value: null, waitingForViewerAccess: false, missedJoinWindow: false },
		viewer: {
			userId: input.viewer.id,
			steamId64: input.steamId64,
			callsign: input.viewer.current_callsign ?? null,
			hasPriorityBadge,
			priorityBadgeLabels,
			heldSlotId: heldSlot?.slot.id ?? null,
			heldSlotAccess: heldSlot?.slot.access ?? null,
			joinedRegular,
			canClaimPriority:
				isPublished && priorityClaimOpen && availablePrioritySlotCount > 0 && !heldSlot && hasPriorityBadge,
			canSwitchPriority:
				isPublished && priorityClaimOpen && heldSlot?.slot.access === 'priority' && availablePrioritySlotCount > 0,
			canJoinRegular:
				isPublished &&
				regularJoinOpen &&
				!joinedRegular &&
				!heldSlot,
			canLeaveRegular: isPublished && joinedRegular,
			unitId: viewerUnit?.unit_id ?? null,
			unitTag: viewerUnit?.tag ?? null,
			unitSideId: viewerUnitAssignment?.side_id ?? null,
			isUnitLeader: viewerIsUnitLeader,
			canClaimUnitSlot:
				unitSlottingOpen &&
				viewerIsUnitLeader &&
				viewerUnitAssignment != null &&
				viewerUnitSlotsUsed < (viewerUnit?.slots_allocated ?? 0),
			unitSlotsUsed: viewerUnitSlotsUsed,
			unitSlotsAllocated: viewerUnit?.slots_allocated ?? 0
		}
	};
}
export function normalizeArchiveCompletedResult(input: {
	slotting: ReturnType<typeof parseCanonicalSlotting>;
	result: { winnerSideId: string | null; sideScores: Array<{ sideId: string; score: number }> };
}): GameArchiveResult | null {
	const sideIds = input.slotting.sides.map((side) => side.id);
	const validSideIds = new Set(sideIds);
	const winnerSideId = input.result.winnerSideId;
	const sideScores = input.result.sideScores;

	if (winnerSideId !== null && !validSideIds.has(winnerSideId)) {
		return null;
	}

	if (sideScores.length === 0) {
		return {
			outcome: winnerSideId ? 'winner' : 'draw',
			winnerSideId,
			sideScores: []
		};
	}

	if (sideScores.length !== sideIds.length) {
		return null;
	}

	const uniqueIds = new Set(sideScores.map((score) => score.sideId));
	if (uniqueIds.size !== sideScores.length) {
		return null;
	}

	for (const score of sideScores) {
		if (!validSideIds.has(score.sideId)) {
			return null;
		}
	}

	const maxScore = Math.max(...sideScores.map((score) => score.score));
	const winners = sideScores.filter((score) => score.score === maxScore);
	const computedWinnerSideId = winners.length === 1 ? winners[0]?.sideId ?? null : null;
	if (winnerSideId !== null && winnerSideId !== computedWinnerSideId) {
		return null;
	}

	return {
		outcome: computedWinnerSideId ? 'winner' : 'draw',
		winnerSideId: computedWinnerSideId,
		sideScores: sideScores.map((score) => {
			const side = input.slotting.sides.find((s) => s.id === score.sideId);
			return { sideId: score.sideId, sideName: side?.displayName ?? side?.name ?? score.sideId, score: score.score };
		})
	};
}

export function badgeTypeIdsExist(db: DbConnection, badgeTypeIds: number[]): boolean {
	if (badgeTypeIds.length === 0) return true;

	const placeholders = badgeTypeIds.map(() => '?').join(', ');
	const rows = db
		.prepare(`SELECT id FROM badge_types WHERE id IN (${placeholders})`)
		.all(...badgeTypeIds) as Array<{ id: number }>;

	return new Set(rows.map((row) => row.id)).size === new Set(badgeTypeIds).size;
}

export function validatePublishableMission(input: {
	row: MissionRow;
	priorityBadgeCount: number;
}): GamePublishValidationError[] {
	const reasons: GamePublishValidationError[] = [];
	let slottingHasPrioritySlots = false;

	try {
		const slotting = parseCanonicalSlotting(input.row.slotting_json);
		slottingHasPrioritySlots = hasPrioritySlots(slotting);
	} catch {
		reasons.push('slotting_invalid');
	}

	if (!input.row.short_code) {
		reasons.push('short_code_required');
	} else if (!/^[A-Za-z0-9-]+$/.test(input.row.short_code)) {
		reasons.push('short_code_invalid');
	}

	if (!input.row.starts_at) reasons.push('starts_at_required');
	if (!isNonEmptyText(input.row.server_name)) reasons.push('server_name_required');
	if (!isNonEmptyText(input.row.server_host)) reasons.push('server_host_required');
	if (input.row.server_port == null) reasons.push('server_port_required');
	if (!isNonEmptyText(input.row.early_password)) {
		reasons.push('early_password_required');
	}
	if (slottingHasPrioritySlots && input.priorityBadgeCount < 1) {
		reasons.push('priority_badge_required');
	}

	return reasons;
}
export function assignUserToPrioritySlot(
	slotting: ReturnType<typeof parseCanonicalSlotting>,
	input: { slotId: string; userId: number; callsign: string }
): ReturnType<typeof parseCanonicalSlotting> {
	return {
		sides: slotting.sides.map((side) => ({
			...side,
			squads: side.squads.map((squad) => ({
				...squad,
				slots: squad.slots.map((slot) => {
					if (slot.id !== input.slotId) return slot;
					return {
						...slot,
						occupant: {
							type: 'user',
							userId: input.userId,
							callsign: input.callsign,
							assignedBy: 'self',
							assignedAt: new Date().toISOString()
						}
					};
				})
			}))
		}))
	};
}

export function switchUserPrioritySlot(
	slotting: ReturnType<typeof parseCanonicalSlotting>,
	input: { fromSlotId: string; toSlotId: string; userId: number; callsign: string }
): ReturnType<typeof parseCanonicalSlotting> {
	const assignedAt = new Date().toISOString();

	return {
		sides: slotting.sides.map((side) => ({
			...side,
			squads: side.squads.map((squad) => ({
				...squad,
				slots: squad.slots.map((slot) => {
					if (slot.id === input.fromSlotId) {
						return { ...slot, occupant: null };
					}
					if (slot.id === input.toSlotId) {
						return {
							...slot,
							occupant: {
								type: 'user',
								userId: input.userId,
								callsign: input.callsign,
								assignedBy: 'self',
								assignedAt
							}
						};
					}
					return slot;
				})
			}))
		}))
	};
}

export function releaseUserPrioritySlot(
	slotting: ReturnType<typeof parseCanonicalSlotting>,
	input: { slotId: string; userId: number }
): ReturnType<typeof parseCanonicalSlotting> {
	return {
		sides: slotting.sides.map((side) => ({
			...side,
			squads: side.squads.map((squad) => ({
				...squad,
				slots: squad.slots.map((slot) => {
					if (slot.id !== input.slotId) return slot;
					if (slot.access !== 'priority') return slot;
					if (slot.occupant?.type !== 'user' || slot.occupant.userId !== input.userId) return slot;
					return { ...slot, occupant: null };
				})
			}))
		}))
	};
}
