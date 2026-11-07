import { z } from 'zod';
import { defineRouteTool, type AdminTool } from './defineTool';
import { getAdminGamesRoute } from '@/features/games/adapters/next/adminGamesRoute';
import {
	deleteAdminGameDraftRoute,
	postAdminGameDraftRoute
} from '@/features/games/adapters/next/adminGameDraftRoute';
import {
	deleteAdminArchivedMissionRoute,
	deleteAdminGameEpisodeRoute,
	deleteAdminGameImageRoute,
	getAdminGameAuditRoute,
	getAdminGameImageRoute,
	getAdminGameMissionRoute,
	postAdminGameArchiveRoute,
	postAdminGameCancelRoute,
	postAdminGameHidePriorityRoute,
	postAdminGameHideRegularRoute,
	postAdminGameHideUnitRoute,
	postAdminGameImageRoute,
	postAdminGameMissionUpdateRoute,
	postAdminGameNotifyDiscordRoute,
	postAdminGameNotifyPriorityDiscordRoute,
	postAdminGamePublishRoute,
	postAdminGameReleasePriorityRoute,
	postAdminGameReleaseRegularRoute,
	postAdminGameReleaseUnitRoute,
	putAdminGameMissionUpdateRoute,
	putAdminGameSettingsRoute,
	putAdminGameSlottingRoute,
	putAdminGameUnitAssignmentsRoute,
	uploadImageRequestSchema
} from '@/features/games/adapters/next/adminGameMissionRoute';
import {
	archiveGameRequestSchema,
	cancelGameRequestSchema,
	createGameDraftRequestSchema,
	createMissionUpdateRequestSchema,
	deleteArchivedMissionRequestSchema,
	deleteEpisodeRequestSchema,
	publishGameRequestSchema,
	updateGameSettingsRequestSchema,
	updateGameSlottingRequestSchema,
	updateMissionUpdateRequestSchema,
	updateUnitAssignmentsRequestSchema
} from '@/features/games/domain/requests';

const missionId = z.number().int().positive().describe('Mission id from games_overview.');
const missionPath = { missionId };

export const gamesTools: AdminTool[] = [
	defineRouteTool({
		name: 'games_overview',
		title: 'Games overview',
		description:
			'Lists the current draft, the published mission and all archived missions as full admin mission objects (id, status, title, settings, slotting, revisions). There is at most one draft and one published mission; use the id with the other games_* tools.',
		annotations: { readOnlyHint: true },
		method: 'GET',
		path: '/api/admin/games',
		handler: getAdminGamesRoute
	}),
	defineRouteTool({
		name: 'games_create_draft',
		title: 'Create mission draft',
		description:
			'Creates the draft for the next mission; only one draft may exist (error draft_exists). mode "duplicate_previous" copies the slotting of the published or latest archived mission, and gameMode "simple" has no unit or priority phases. Drafts are admin-only until games_publish; returns the new mission.',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		method: 'POST',
		path: '/api/admin/games/draft',
		body: createGameDraftRequestSchema,
		handler: postAdminGameDraftRoute
	}),
	defineRouteTool({
		name: 'games_delete_draft',
		title: 'Delete mission draft',
		description:
			'Permanently deletes the current draft mission; takes no id because only one draft exists. Irreversible; fails with not_found when there is no draft.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
		method: 'DELETE',
		path: '/api/admin/games/draft',
		handler: deleteAdminGameDraftRoute
	}),
	defineRouteTool({
		name: 'games_get',
		title: 'Get mission',
		description:
			'Returns one mission\'s full admin state: settings including early and final server passwords, settingsRevision, slotting per episode with its slottingRevision, unit assignments, public updates (with ids) and release/archive state. Read it before any mutating games tool to get current revisions and ids.',
		annotations: { readOnlyHint: true },
		method: 'GET',
		path: '/api/admin/games/{missionId}',
		pathParams: missionPath,
		handler: getAdminGameMissionRoute
	}),
	defineRouteTool({
		name: 'games_delete_archived',
		title: 'Delete archived mission',
		description:
			'Permanently deletes an archived mission (fails with not_archived otherwise). titleConfirmation must equal the mission title exactly. Irreversible.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
		method: 'DELETE',
		path: '/api/admin/games/{missionId}',
		pathParams: missionPath,
		body: deleteArchivedMissionRequestSchema,
		handler: deleteAdminArchivedMissionRoute
	}),
	defineRouteTool({
		name: 'games_update_settings',
		title: 'Update mission settings',
		description:
			'Replaces all mission settings at once: send every field (copy them from games_get) plus the current settingsRevision, else settings_revision_conflict; description needs en, ru, uk and ar texts, shortCode can only change while the mission is a draft, and omitting earlyPassword/finalPassword keeps them while null clears them. Changes are visible to players on a published mission. Once priority claiming opens (priorityClaimManualState "open", or "default" with priorityClaimOpensAt reached) the cron pings the priority badge Discord roles unless skipPriorityDiscord is true.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
		method: 'PUT',
		path: '/api/admin/games/{missionId}/settings',
		pathParams: missionPath,
		body: updateGameSettingsRequestSchema,
		handler: putAdminGameSettingsRoute
	}),
	defineRouteTool({
		name: 'games_update_slotting',
		title: 'Update episode slotting',
		description:
			'Replaces one episode\'s whole slotting (sides, squads, slots with access and occupants) given that episode\'s current slottingRevision from games_get; a new episodeNumber creates the episode, copying the previous episode\'s unit assignments, and while the mission is a draft every slot must have access "unit". Edits that remove or change occupied slots fail with destructive_change_requires_confirmation and the affected slots unless confirmDestructive is true, which drops those players from their slots. Players see the change live.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
		method: 'PUT',
		path: '/api/admin/games/{missionId}/slotting',
		pathParams: missionPath,
		body: updateGameSlottingRequestSchema,
		handler: putAdminGameSlottingRoute
	}),
	defineRouteTool({
		name: 'games_delete_episode',
		title: 'Delete episode',
		description:
			'Deletes one episode\'s slotting and unit assignments; episode 1 cannot be deleted. With occupied slots it fails with has_occupied_slots and occupiedCount unless confirmOccupied is true, which removes those players from the episode. Irreversible; returns the updated mission.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
		method: 'DELETE',
		path: '/api/admin/games/{missionId}/slotting',
		pathParams: missionPath,
		body: deleteEpisodeRequestSchema,
		handler: deleteAdminGameEpisodeRoute
	}),
	defineRouteTool({
		name: 'games_publish',
		title: 'Publish mission',
		description:
			'Publishes the draft so players see it on the site; needs the draft\'s current settingsRevision and no other published mission, and fails with publish_validation_failed plus reasons when settings or slotting are incomplete. Unless skipDiscord is true it also posts the mission announcement (with image, pinging the confirmed-player role) to the Discord news channel. Returns the published mission.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
		method: 'POST',
		path: '/api/admin/games/{missionId}/publish',
		pathParams: missionPath,
		body: publishGameRequestSchema,
		handler: postAdminGamePublishRoute
	}),
	defineRouteTool({
		name: 'games_notify_discord',
		title: 'Re-announce mission in Discord',
		description:
			'Posts the published mission\'s announcement (title, description, start time, slotting summary, image) to the Discord news channel again, pinging the confirmed-player role. Sends a new message on every call; only works on the published mission (else not_published).',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
		method: 'POST',
		path: '/api/admin/games/{missionId}/notify-discord',
		pathParams: missionPath,
		handler: postAdminGameNotifyDiscordRoute
	}),
	defineRouteTool({
		name: 'games_notify_priority_discord',
		title: 'Announce priority slotting in Discord',
		description:
			'Posts the "priority slotting is open" message to the Discord news channel, pinging the Discord roles of the mission\'s priority badges. Sends a new message on every call; only works on the published mission. The cron already sends this once when priority claiming opens unless skipPriorityDiscord is set.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
		method: 'POST',
		path: '/api/admin/games/{missionId}/notify-priority-discord',
		pathParams: missionPath,
		handler: postAdminGameNotifyPriorityDiscordRoute
	}),
	defineRouteTool({
		name: 'games_release_unit',
		title: 'Release to units',
		description:
			'Shows the final server password to members of the units assigned to the mission and closes unit slotting. Needs a published standard-mode mission with a final password set; undo with games_hide_unit.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
		method: 'POST',
		path: '/api/admin/games/{missionId}/release-unit',
		pathParams: missionPath,
		handler: postAdminGameReleaseUnitRoute
	}),
	defineRouteTool({
		name: 'games_release_priority',
		title: 'Release to priority players',
		description:
			'Shows the final server password to priority slot holders and closes priority claiming and unit slotting. Needs a published standard-mode mission with a final password set, and is required before games_release_regular; undo with games_hide_priority.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
		method: 'POST',
		path: '/api/admin/games/{missionId}/release-priority',
		pathParams: missionPath,
		handler: postAdminGameReleasePriorityRoute
	}),
	defineRouteTool({
		name: 'games_release_regular',
		title: 'Release to regular players',
		description:
			'Shows the final server password to regular players who joined, and closes regular joining and unit slotting. In standard mode it needs games_release_priority first and a final password; in simple mode it is the only release step. Undo with games_hide_regular.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
		method: 'POST',
		path: '/api/admin/games/{missionId}/release-regular',
		pathParams: missionPath,
		handler: postAdminGameReleaseRegularRoute
	}),
	defineRouteTool({
		name: 'games_hide_unit',
		title: 'Hide unit release',
		description:
			'Withdraws the unit release so unit members no longer see the final server password. Fails with priority_release_hide_required while the priority release is active; does not reopen unit slotting.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
		method: 'POST',
		path: '/api/admin/games/{missionId}/hide-unit',
		pathParams: missionPath,
		handler: postAdminGameHideUnitRoute
	}),
	defineRouteTool({
		name: 'games_hide_priority',
		title: 'Hide priority release',
		description:
			'Withdraws the priority release so priority slot holders no longer see the final server password. Fails with regular_release_hide_required while the regular release is active; does not reopen priority claiming.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
		method: 'POST',
		path: '/api/admin/games/{missionId}/hide-priority',
		pathParams: missionPath,
		handler: postAdminGameHidePriorityRoute
	}),
	defineRouteTool({
		name: 'games_hide_regular',
		title: 'Hide regular release',
		description:
			'Withdraws the regular release so regular players no longer see the final server password; does not reopen regular joining.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
		method: 'POST',
		path: '/api/admin/games/{missionId}/hide-regular',
		pathParams: missionPath,
		handler: postAdminGameHideRegularRoute
	}),
	defineRouteTool({
		name: 'games_update_unit_assignments',
		title: 'Set unit assignments',
		description:
			'Replaces the units assigned to sides for one episode (default 1); an empty list removes them all. Each unit must be verified with allocated slots and each sideId must exist in that episode\'s slotting. Assigned units\' members can claim unit slots and see the final password after games_release_unit.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
		method: 'PUT',
		path: '/api/admin/games/{missionId}/unit-assignments',
		pathParams: missionPath,
		body: updateUnitAssignmentsRequestSchema,
		handler: putAdminGameUnitAssignmentsRoute
	}),
	defineRouteTool({
		name: 'games_post_update',
		title: 'Post mission update',
		description:
			'Adds a public progress update to the published mission (units/priority/regular slotting started, or episode N of totalEpisodes started; totalEpisodes defaults to 3 and must be at least episodeNumber) and posts the matching message to the Discord game-stages channel. Creates a new update and Discord message on every call.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
		method: 'POST',
		path: '/api/admin/games/{missionId}/updates',
		pathParams: missionPath,
		body: createMissionUpdateRequestSchema,
		handler: postAdminGameMissionUpdateRoute
	}),
	defineRouteTool({
		name: 'games_edit_update',
		title: 'Edit mission update',
		description:
			'Changes the kind, episodeNumber and totalEpisodes of an existing public update (updateId from games_get updates); only on the published mission. It also posts a fresh Discord message with the new text instead of editing the earlier one.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
		method: 'PUT',
		path: '/api/admin/games/{missionId}/updates/{updateId}',
		pathParams: {
			missionId,
			updateId: z.number().int().positive().describe('Update id from the mission\'s updates list in games_get.')
		},
		body: updateMissionUpdateRequestSchema,
		handler: putAdminGameMissionUpdateRoute
	}),
	defineRouteTool({
		name: 'games_archive',
		title: 'Archive mission as completed',
		description:
			'Ends the published mission as completed and moves it to the public archive with its result: winnerSideId (null for a draw) and either no sideScores or exactly one score per side, where a single top score must match the winner. Also closes priority claiming and regular joining and deletes the mission image. Cannot be undone with these tools.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
		method: 'POST',
		path: '/api/admin/games/{missionId}/archive',
		pathParams: missionPath,
		body: archiveGameRequestSchema,
		handler: postAdminGameArchiveRoute
	}),
	defineRouteTool({
		name: 'games_cancel',
		title: 'Cancel mission',
		description:
			'Cancels the published mission: archives it as canceled with the given reason, closes priority claiming and regular joining, and deletes the mission image. Cannot be undone with these tools.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
		method: 'POST',
		path: '/api/admin/games/{missionId}/cancel',
		pathParams: missionPath,
		body: cancelGameRequestSchema,
		handler: postAdminGameCancelRoute
	}),
	defineRouteTool({
		name: 'games_get_audit',
		title: 'Get mission audit log',
		description:
			'Returns the mission\'s audit events, newest first: event type, actor (SteamID64, callsign), timestamp and payload (e.g. before/after settings, slot claims, releases).',
		annotations: { readOnlyHint: true },
		method: 'GET',
		path: '/api/admin/games/{missionId}/audit',
		pathParams: missionPath,
		handler: getAdminGameAuditRoute
	}),
	defineRouteTool({
		name: 'games_get_image',
		title: 'Get mission image',
		description:
			'Returns the mission image (PNG, JPEG or WebP) that is attached to its Discord announcements, as image content; HTTP 404 when none is set.',
		annotations: { readOnlyHint: true },
		method: 'GET',
		path: '/api/admin/games/{missionId}/image',
		pathParams: missionPath,
		handler: getAdminGameImageRoute
	}),
	defineRouteTool({
		name: 'games_upload_image',
		title: 'Upload mission image',
		description:
			'Sets or replaces the mission image attached to its Discord announcements. data is the raw base64 of the file (no data: URL prefix), at most 2,000,000 base64 characters (about 1.5 MB); mime must be image/png, image/jpeg or image/webp and match the file\'s bytes. Not recorded in the audit log.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
		method: 'POST',
		path: '/api/admin/games/{missionId}/image',
		pathParams: missionPath,
		body: uploadImageRequestSchema,
		handler: postAdminGameImageRoute
	}),
	defineRouteTool({
		name: 'games_delete_image',
		title: 'Delete mission image',
		description:
			'Removes the mission image; it can only be restored by uploading it again. Not recorded in the audit log.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
		method: 'DELETE',
		path: '/api/admin/games/{missionId}/image',
		pathParams: missionPath,
		handler: deleteAdminGameImageRoute
	})
];
