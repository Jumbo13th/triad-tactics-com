import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/features/admin/adapters/next/adminAuth';
import {
	archiveGameRequestSchema,
	cancelGameRequestSchema,
	createMissionUpdateRequestSchema,
	deleteArchivedMissionRequestSchema,
	publishGameRequestSchema,
	shortCodeSchema,
	updateMissionUpdateRequestSchema,
	updateGameSettingsRequestSchema,
	updateGameSlottingRequestSchema,
	updateUnitAssignmentsRequestSchema
} from '@/features/games/domain/requests';
import {
	archiveGameDeps,
	cancelGameDeps,
	createMissionUpdateDeps,
	deleteArchivedMissionDeps,
	getAdminGameMissionDeps,
	getMissionAuditDeps,
	hidePriorityGameplayDeps,
	hideRegularGameplayDeps,
	hideUnitGameplayDeps,
	publishGameDeps,
	releasePriorityGameplayDeps,
	releaseRegularGameplayDeps,
	releaseUnitGameplayDeps,
	updateMissionUpdateDeps,
	updateGameSettingsDeps,
	updateGameSlottingDeps,
	updateUnitAssignmentsDeps
} from '@/features/games/deps';
import { archiveGame } from '@/features/games/useCases/archiveGame';
import { cancelGame } from '@/features/games/useCases/cancelGame';
import { createMissionUpdate } from '@/features/games/useCases/createMissionUpdate';
import { deleteArchivedMission } from '@/features/games/useCases/deleteArchivedMission';
import { getAdminGameMission } from '@/features/games/useCases/getAdminGameMission';
import { getMissionAuditHistory } from '@/features/games/useCases/getMissionAuditHistory';
import { hidePriorityGameplay } from '@/features/games/useCases/hidePriorityGameplay';
import { hideRegularGameplay } from '@/features/games/useCases/hideRegularGameplay';
import { publishGame } from '@/features/games/useCases/publishGame';
import { releasePriorityGameplay } from '@/features/games/useCases/releasePriorityGameplay';
import { releaseUnitGameplay } from '@/features/games/useCases/releaseUnitGameplay';
import { hideUnitGameplay } from '@/features/games/useCases/hideUnitGameplay';
import { releaseRegularGameplay } from '@/features/games/useCases/releaseRegularGameplay';
import { updateMissionUpdate } from '@/features/games/useCases/updateMissionUpdate';
import { updateGameSettings } from '@/features/games/useCases/updateGameSettings';
import { updateGameSlotting } from '@/features/games/useCases/updateGameSlotting';
import { updateUnitAssignments } from '@/features/games/useCases/updateUnitAssignments';
import { DISCORD_BOT_TOKEN } from '@/platform/env';
import { errorToLogObject, logger } from '@/platform/logger';
import type { ZodIssue } from 'zod';
import {notifyMissionUpdateInDiscord} from "@/features/games/useCases/notifyMissionUpdateInDiscord";

type AdminGameMissionRouteContext = {
	params: Promise<{ missionId: string }>;
};

type AdminGameMissionUpdateRouteContext = {
	params: Promise<{ missionId: string; updateId: string }>;
};

async function readRequestBody(request: NextRequest): Promise<unknown> {
	const raw = await request.text();
	if (!raw.trim()) return {};
	return JSON.parse(raw) as unknown;
}

async function readMissionId(context: AdminGameMissionRouteContext): Promise<number | null> {
	const { missionId } = await context.params;
	const parsed = Number(missionId);
	if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
	return parsed;
}

async function readMissionAndUpdateIds(context: AdminGameMissionUpdateRouteContext): Promise<{ missionId: number; updateId: number } | null> {
	const { missionId, updateId } = await context.params;
	const parsedMissionId = Number(missionId);
	const parsedUpdateId = Number(updateId);
	if (!Number.isSafeInteger(parsedMissionId) || parsedMissionId < 1) return null;
	if (!Number.isSafeInteger(parsedUpdateId) || parsedUpdateId < 1) return null;
	return { missionId: parsedMissionId, updateId: parsedUpdateId };
}

function serializeValidationIssue(issue: ZodIssue): {
	code: string;
	path: Array<string | number>;
	message: string;
	minimum?: number;
	maximum?: number;
} {
	const serialized: {
		code: string;
		path: Array<string | number>;
		message: string;
		minimum?: number;
		maximum?: number;
	} = {
		code: issue.code,
		path: issue.path.filter((segment): segment is string | number => typeof segment === 'string' || typeof segment === 'number'),
		message: issue.message
	};

	if ('minimum' in issue && typeof issue.minimum === 'number') {
		serialized.minimum = issue.minimum;
	}

	if ('maximum' in issue && typeof issue.maximum === 'number') {
		serialized.maximum = issue.maximum;
	}

	return serialized;
}

function mapSlottingMutationError(result: {
	error:
		| 'not_found'
		| 'slotting_invalid'
		| 'legacy_slotting_invalid'
		| 'slotting_revision_conflict'
		| 'regular_join_requires_regular_slots'
		| 'destructive_change_requires_confirmation'
		| 'episode_not_found'
		| 'database_error';
	destructiveChanges?: unknown;
}): NextResponse {
	if (result.error === 'not_found') {
		return NextResponse.json({ error: 'not_found' }, { status: 404 });
	}

	if (result.error === 'slotting_invalid' || result.error === 'legacy_slotting_invalid') {
		return NextResponse.json({ error: result.error }, { status: 400 });
	}

	if (result.error === 'destructive_change_requires_confirmation') {
		return NextResponse.json(
			{ error: result.error, destructiveChanges: result.destructiveChanges ?? [] },
			{ status: 409 }
		);
	}

	const status = result.error === 'database_error' ? 500 : 409;
	return NextResponse.json({ error: result.error }, { status });
}

function mapGameplayReleaseError(result: { error: string }): NextResponse {
	if (result.error === 'not_found') {
		return NextResponse.json({ error: 'not_found' }, { status: 404 });
	}

	const status = result.error === 'database_error' ? 500 : 409;
	return NextResponse.json({ error: result.error }, { status });
}

function mapArchiveLifecycleError(result: { error: string }): NextResponse {
	if (result.error === 'not_found') {
		return NextResponse.json({ error: 'not_found' }, { status: 404 });
	}

	if (result.error === 'archive_result_invalid' || result.error === 'cancel_reason_required') {
		return NextResponse.json({ error: result.error }, { status: 400 });
	}

	const status = result.error === 'database_error' ? 500 : 409;
	return NextResponse.json({ error: result.error }, { status });
}

function mapDeleteArchivedMissionError(result: { error: string }): NextResponse {
	if (result.error === 'not_found') {
		return NextResponse.json({ error: 'not_found' }, { status: 404 });
	}

	const status = result.error === 'database_error' ? 500 : 409;
	return NextResponse.json({ error: result.error }, { status });
}

function readCanonicalMissionShortCode(missionId: number): string | null {
	const mission = getAdminGameMission(getAdminGameMissionDeps, { missionId });
	if (!mission.ok) return null;
	const parsed = shortCodeSchema.safeParse(mission.mission.shortCode);
	if (!parsed.success) return null;
	return parsed.data;
}

export async function getAdminGameMissionRoute(
	request: NextRequest,
	context: AdminGameMissionRouteContext
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const missionId = await readMissionId(context);
		if (!missionId) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const mission = getAdminGameMission(getAdminGameMissionDeps, { missionId });
		if (!mission.ok) {
			if (mission.error === 'not_found') {
				return NextResponse.json({ error: 'not_found' }, { status: 404 });
			}
			return NextResponse.json({ error: 'database_error' }, { status: 500 });
		}

		return NextResponse.json({ success: true, mission: mission.mission });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_game_load_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function putAdminGameSettingsRoute(
	request: NextRequest,
	context: AdminGameMissionRouteContext
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const missionId = await readMissionId(context);
		if (!missionId) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		let body: unknown;
		try {
			body = await readRequestBody(request);
		} catch {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const parsed = updateGameSettingsRequestSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json(
				{ error: 'validation_error', details: parsed.error.issues.map(serializeValidationIssue) },
				{ status: 400 }
			);
		}

		const updated = updateGameSettings(updateGameSettingsDeps, {
			...parsed.data,
			missionId,
			updatedBySteamId64: admin.identity.steamid64
		});

		if (!updated.ok) {
			if (updated.error === 'not_found') {
				return NextResponse.json({ error: 'not_found' }, { status: 404 });
			}
			const status = updated.error === 'database_error' ? 500 : 409;
			return NextResponse.json({ error: updated.error }, { status });
		}

		return NextResponse.json({ success: true, mission: updated.mission });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_game_settings_update_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function putAdminGameSlottingRoute(
	request: NextRequest,
	context: AdminGameMissionRouteContext
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const missionId = await readMissionId(context);
		if (!missionId) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		let body: unknown;
		try {
			body = await readRequestBody(request);
		} catch {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const parsed = updateGameSlottingRequestSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const updated = updateGameSlotting(updateGameSlottingDeps, {
			...parsed.data,
			missionId,
			updatedBySteamId64: admin.identity.steamid64
		});

		if (!updated.ok) {
			return mapSlottingMutationError(updated);
		}

		return NextResponse.json({ success: true, mission: updated.mission });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_game_slotting_update_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function deleteAdminGameEpisodeRoute(
	request: NextRequest,
	context: AdminGameMissionRouteContext
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const missionId = await readMissionId(context);
		if (!missionId) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		let body: unknown;
		try {
			body = await readRequestBody(request);
		} catch {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const parsed = z.object({
			episodeNumber: z.number().int().min(1),
			confirmOccupied: z.boolean().optional().default(false)
		}).safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const { deleteEpisodeSlotting } = await import('@/features/games/infra/sqliteGames');
		const result = deleteEpisodeSlotting({
			missionId,
			episodeNumber: parsed.data.episodeNumber,
			confirmOccupied: parsed.data.confirmOccupied,
			deletedBySteamId64: admin.identity.steamid64
		});

		if (!result.success) {
			if (result.error === 'not_found' || result.error === 'episode_not_found') {
				return NextResponse.json({ error: result.error }, { status: 404 });
			}
			if (result.error === 'cannot_delete_episode_1') {
				return NextResponse.json({ error: result.error }, { status: 400 });
			}
			if (result.error === 'has_occupied_slots') {
				return NextResponse.json({ error: result.error, occupiedCount: result.occupiedCount }, { status: 409 });
			}
			return NextResponse.json({ error: result.error }, { status: 500 });
		}

		return NextResponse.json({ success: true, mission: result.mission });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_game_episode_delete_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminGamePublishRoute(
	request: NextRequest,
	context: AdminGameMissionRouteContext
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const missionId = await readMissionId(context);
		if (!missionId) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		let body: unknown;
		try {
			body = await readRequestBody(request);
		} catch {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const parsed = publishGameRequestSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const published = publishGame(publishGameDeps, {
			...parsed.data,
			missionId,
			publishedBySteamId64: admin.identity.steamid64
		});

		if (!published.ok) {
			if (published.error === 'not_found') {
				return NextResponse.json({ error: 'not_found' }, { status: 404 });
			}
			if (published.error === 'publish_validation_failed') {
				return NextResponse.json(
					{ error: published.error, reasons: published.reasons ?? [] },
					{ status: 409 }
				);
			}
			const status = published.error === 'database_error' ? 500 : 409;
			return NextResponse.json({ error: published.error }, { status });
		}

		return NextResponse.json({ success: true, mission: published.mission });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_game_publish_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminGameReleaseUnitRoute(
	request: NextRequest,
	context: AdminGameMissionRouteContext
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const missionId = await readMissionId(context);
		if (!missionId) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const released = releaseUnitGameplay(releaseUnitGameplayDeps, {
			missionId,
			releasedBySteamId64: admin.identity.steamid64
		});

		if (!released.ok) {
			return mapGameplayReleaseError(released);
		}

		return NextResponse.json({ success: true, mission: released.mission });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_game_release_unit_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminGameHideUnitRoute(
	request: NextRequest,
	context: AdminGameMissionRouteContext
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const missionId = await readMissionId(context);
		if (!missionId) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const hidden = hideUnitGameplay(hideUnitGameplayDeps, {
			missionId,
			hiddenBySteamId64: admin.identity.steamid64
		});

		if (!hidden.ok) {
			return mapGameplayReleaseError(hidden);
		}

		return NextResponse.json({ success: true, mission: hidden.mission });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_game_hide_unit_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminGameReleasePriorityRoute(
	request: NextRequest,
	context: AdminGameMissionRouteContext
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const missionId = await readMissionId(context);
		if (!missionId) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const released = releasePriorityGameplay(releasePriorityGameplayDeps, {
			missionId,
			releasedBySteamId64: admin.identity.steamid64
		});

		if (!released.ok) {
			return mapGameplayReleaseError(released);
		}

		return NextResponse.json({ success: true, mission: released.mission });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_game_release_priority_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminGameReleaseRegularRoute(
	request: NextRequest,
	context: AdminGameMissionRouteContext
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const missionId = await readMissionId(context);
		if (!missionId) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const released = releaseRegularGameplay(releaseRegularGameplayDeps, {
			missionId,
			releasedBySteamId64: admin.identity.steamid64
		});

		if (!released.ok) {
			return mapGameplayReleaseError(released);
		}

		return NextResponse.json({ success: true, mission: released.mission });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_game_release_regular_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminGameHidePriorityRoute(
	request: NextRequest,
	context: AdminGameMissionRouteContext
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const missionId = await readMissionId(context);
		if (!missionId) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const hidden = hidePriorityGameplay(hidePriorityGameplayDeps, {
			missionId,
			hiddenBySteamId64: admin.identity.steamid64
		});

		if (!hidden.ok) {
			return mapGameplayReleaseError(hidden);
		}

		return NextResponse.json({ success: true, mission: hidden.mission });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_game_hide_priority_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminGameHideRegularRoute(
	request: NextRequest,
	context: AdminGameMissionRouteContext
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const missionId = await readMissionId(context);
		if (!missionId) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const hidden = hideRegularGameplay(hideRegularGameplayDeps, {
			missionId,
			hiddenBySteamId64: admin.identity.steamid64
		});

		if (!hidden.ok) {
			return mapGameplayReleaseError(hidden);
		}

		return NextResponse.json({ success: true, mission: hidden.mission });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_game_hide_regular_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminGameMissionUpdateRoute(
	request: NextRequest,
	context: AdminGameMissionRouteContext
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const missionId = await readMissionId(context);
		if (!missionId) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		let body: unknown;
		try {
			body = await readRequestBody(request);
		} catch {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const parsed = createMissionUpdateRequestSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'validation_error', details: parsed.error.issues.map(serializeValidationIssue) }, { status: 400 });
		}

		const created = createMissionUpdate(createMissionUpdateDeps, {
			...parsed.data,
			missionId,
			createdBySteamId64: admin.identity.steamid64
		});

		if (!created.ok) {
			if (created.error === 'not_found') {
				return NextResponse.json({ error: 'not_found' }, { status: 404 });
			}

			const status = created.error === 'database_error' ? 500 : 409;
			return NextResponse.json({ error: created.error }, { status });
		}

		const shortCode = readCanonicalMissionShortCode(missionId);
		notifyMissionUpdateInDiscord({ ...parsed.data, shortCode }, DISCORD_BOT_TOKEN).catch((error) => {
			logger.error({ ...errorToLogObject(error) }, 'discord_mission_update_notification_failed');
		});

		return NextResponse.json({ success: true, mission: created.mission });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_game_update_create_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function putAdminGameMissionUpdateRoute(
	request: NextRequest,
	context: AdminGameMissionUpdateRouteContext
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const ids = await readMissionAndUpdateIds(context);
		if (!ids) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		let body: unknown;
		try {
			body = await readRequestBody(request);
		} catch {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const parsed = updateMissionUpdateRequestSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'validation_error', details: parsed.error.issues.map(serializeValidationIssue) }, { status: 400 });
		}

		const updated = updateMissionUpdate(updateMissionUpdateDeps, {
			...parsed.data,
			missionId: ids.missionId,
			updateId: ids.updateId,
			updatedBySteamId64: admin.identity.steamid64
		});

		if (!updated.ok) {
			if (updated.error === 'not_found') {
				return NextResponse.json({ error: 'not_found' }, { status: 404 });
			}

			const status = updated.error === 'database_error' ? 500 : 409;
			return NextResponse.json({ error: updated.error }, { status });
		}

		const shortCode = readCanonicalMissionShortCode(ids.missionId);
		notifyMissionUpdateInDiscord({ ...parsed.data, shortCode }, DISCORD_BOT_TOKEN).catch((error) => {
			logger.error({ ...errorToLogObject(error) }, 'discord_mission_update_notification_failed');
		});

		return NextResponse.json({ success: true, mission: updated.mission });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_game_update_edit_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminGameArchiveRoute(
	request: NextRequest,
	context: AdminGameMissionRouteContext
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const missionId = await readMissionId(context);
		if (!missionId) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		let body: unknown;
		try {
			body = await readRequestBody(request);
		} catch {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const parsed = archiveGameRequestSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const archived = archiveGame(archiveGameDeps, {
			...parsed.data,
			missionId,
			archivedBySteamId64: admin.identity.steamid64
		});

		if (!archived.ok) {
			return mapArchiveLifecycleError(archived);
		}

		return NextResponse.json({ success: true, mission: archived.mission });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_game_archive_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminGameCancelRoute(
	request: NextRequest,
	context: AdminGameMissionRouteContext
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const missionId = await readMissionId(context);
		if (!missionId) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		let body: unknown;
		try {
			body = await readRequestBody(request);
		} catch {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const parsed = cancelGameRequestSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const canceled = cancelGame(cancelGameDeps, {
			...parsed.data,
			missionId,
			archivedBySteamId64: admin.identity.steamid64
		});

		if (!canceled.ok) {
			return mapArchiveLifecycleError(canceled);
		}

		return NextResponse.json({ success: true, mission: canceled.mission });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_game_cancel_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function getAdminGameAuditRoute(
	request: NextRequest,
	context: AdminGameMissionRouteContext
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const missionId = await readMissionId(context);
		if (!missionId) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const audit = getMissionAuditHistory(getMissionAuditDeps, { missionId });
		if (!audit.ok) {
			if (audit.error === 'not_found') {
				return NextResponse.json({ error: 'not_found' }, { status: 404 });
			}
			return NextResponse.json({ error: 'database_error' }, { status: 500 });
		}

		return NextResponse.json({ success: true, events: audit.events });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_game_audit_load_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function deleteAdminArchivedMissionRoute(
	request: NextRequest,
	context: AdminGameMissionRouteContext
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const missionId = await readMissionId(context);
		if (!missionId) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		let body: unknown;
		try {
			body = await readRequestBody(request);
		} catch {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const parsed = deleteArchivedMissionRequestSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const deleted = deleteArchivedMission(deleteArchivedMissionDeps, {
			...parsed.data,
			missionId
		});

		if (!deleted.ok) {
			return mapDeleteArchivedMissionError(deleted);
		}

		return NextResponse.json({ success: true });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_archived_game_delete_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function putAdminGameUnitAssignmentsRoute(
	request: NextRequest,
	context: AdminGameMissionRouteContext
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const missionId = await readMissionId(context);
		if (!missionId) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		let body: unknown;
		try {
			body = await readRequestBody(request);
		} catch {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const parsed = updateUnitAssignmentsRequestSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const result = updateUnitAssignments(updateUnitAssignmentsDeps, {
			...parsed.data,
			missionId,
			updatedBySteamId64: admin.identity.steamid64
		});

		if (!result.ok) {
			if (result.error === 'not_found') {
				return NextResponse.json({ error: result.error }, { status: 404 });
			}
			const status = result.error === 'database_error' ? 500 : 400;
			return NextResponse.json({ error: result.error }, { status });
		}

		return NextResponse.json({ success: true, mission: result.mission });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_game_unit_assignments_update_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
