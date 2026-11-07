import { z } from 'zod';
import { defineRouteTool, type AdminTool } from './defineTool';
import {
	deleteAdminAvatarRoute,
	getAdminListUnitsRoute,
	getAdminUnitDetailRoute,
	postAdminManageMembersRoute,
	postAdminSetLeaderRoute,
	postAdminSetSlotsRoute,
	postAdminUploadAvatarRoute,
	postAdminVerifyUnitRoute,
	putAdminUpdateUnitRoute
} from '@/features/units/adapters/next/adminUnitRoutes';
import {
	adminSetLeaderRequestSchema,
	adminSetSlotsRequestSchema,
	adminVerifyUnitRequestSchema,
	manageMemberRequestSchema,
	updateUnitRequestSchema,
	uploadAvatarRequestSchema
} from '@/features/units/domain/requests';
import {
	cancelSanctionSchema,
	createSanctionSchema,
	getAdminSanctionsRoute,
	postAdminCancelSanctionRoute,
	postAdminCreateSanctionRoute,
	postAdminUpdateSanctionExpiryRoute,
	updateExpirySchema
} from '@/features/sanctions/adapters/next/adminSanctionsHandlers';
import { getAdminRotationRoute, putAdminRotationRoute } from '@/features/rotation/adapters/next/adminRotationRoute';
import { updateRotationRequestSchema } from '@/features/rotation/domain/requests';

const unitId = z.number().int().positive().describe('Unit id from units_list.');
const sanctionId = z.number().int().positive().describe('Sanction id from sanctions_list.');
const page = z.number().int().positive().optional().describe('1-based page.');

export const communityTools: AdminTool[] = [
	defineRouteTool({
		name: 'units_list',
		title: 'List units',
		description:
			'Lists units with id, name, tag, status, leader callsign, member count, allocated game slots and whether they have an avatar, plus the total. q matches name, tag or leader callsign.',
		annotations: { readOnlyHint: true },
		method: 'GET',
		path: '/api/admin/units',
		query: {
			status: z.enum(['unverified', 'verified']).optional().describe('Defaults to both.'),
			q: z.string().optional().describe('Free-text search.'),
			hasSlots: z.boolean().optional().describe('true: only units with allocated slots; false: only units without.'),
			page,
			pageSize: z.number().int().positive().max(100).optional().describe('Defaults to 50.')
		},
		handler: getAdminListUnitsRoute
	}),
	defineRouteTool({
		name: 'units_get',
		title: 'Show unit',
		description:
			'Shows one unit in full (application texts, join message, verification history, slots), its members and applicants with user id, callsign, SteamID64 and role, and its event log.',
		annotations: { readOnlyHint: true },
		method: 'GET',
		path: '/api/admin/units/{unitId}',
		pathParams: { unitId },
		handler: getAdminUnitDetailRoute
	}),
	defineRouteTool({
		name: 'units_update',
		title: 'Edit unit',
		description:
			'Overwrites any of the unit\'s public name, tag, description and join message; omitted fields stay unchanged. Fails with 409 when the name or tag is taken by another unit.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		method: 'PUT',
		path: '/api/admin/units/{unitId}',
		pathParams: { unitId },
		body: updateUnitRequestSchema,
		handler: putAdminUpdateUnitRoute
	}),
	defineRouteTool({
		name: 'units_verify',
		title: 'Verify or unverify unit',
		description:
			'With action "verify", marks an unverified unit as a verified community unit; with "unverify", reverts it. Logged in the unit\'s public event log; 409 when the unit is already in that state.',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		method: 'POST',
		path: '/api/admin/units/{unitId}/verify',
		pathParams: { unitId },
		// Deletion goes through the same route; it gets its own tool so it is never one enum value away.
		body: adminVerifyUnitRequestSchema.extend({
			action: adminVerifyUnitRequestSchema.shape.action.exclude(['delete'])
		}),
		handler: postAdminVerifyUnitRoute
	}),
	defineRouteTool({
		name: 'units_delete',
		title: 'Delete unit',
		description:
			'Permanently deletes the unit; the database cascade also removes its memberships and applications, event log, mission slot assignments, rotation places and commander-schedule pairs, and its rows in published game statistics. Irreversible and visible on the public site.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		method: 'POST',
		path: '/api/admin/units/{unitId}/verify',
		pathParams: { unitId },
		encodeBody: () => ({ body: JSON.stringify({ action: 'delete' }), contentType: 'application/json' }),
		handler: postAdminVerifyUnitRoute
	}),
	defineRouteTool({
		name: 'units_set_slots',
		title: 'Set unit game slots',
		description:
			'Sets how many game slots (0–100) the unit is allocated. A unit needs at least one slot to be placed in the rotation. Logged in the unit\'s event log.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		method: 'POST',
		path: '/api/admin/units/{unitId}/slots',
		pathParams: { unitId },
		body: adminSetSlotsRequestSchema,
		handler: postAdminSetSlotsRoute
	}),
	defineRouteTool({
		name: 'units_set_leader',
		title: 'Change unit leader',
		description:
			'Makes an existing member or deputy (user id from units_get) the unit leader; the previous leader becomes a regular member. Logged in the unit\'s event log.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		method: 'POST',
		path: '/api/admin/units/{unitId}/leader',
		pathParams: { unitId },
		body: adminSetLeaderRequestSchema,
		handler: postAdminSetLeaderRoute
	}),
	defineRouteTool({
		name: 'units_manage_members',
		title: 'Manage unit member',
		description:
			'Acts on one membership (user id from units_get): "approve" an applicant (drops their other applications), "reject" an applicant, "remove" a member (leaders included), or "set_role" to member, applicant or deputy (role required). Fails with 409 when the user is already a member of another unit; logged in the unit\'s event log.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		method: 'POST',
		path: '/api/admin/units/{unitId}/members',
		pathParams: { unitId },
		body: manageMemberRequestSchema,
		handler: postAdminManageMembersRoute
	}),
	defineRouteTool({
		name: 'units_upload_avatar',
		title: 'Replace unit avatar',
		description:
			'Replaces the unit\'s public avatar. data is the raw image file as plain base64 (no data: URL prefix), at most 350,000 base64 characters (about 256 KB); mime must match the file\'s actual PNG, JPEG or WebP signature.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		method: 'POST',
		path: '/api/admin/units/{unitId}/avatar',
		pathParams: { unitId },
		body: uploadAvatarRequestSchema,
		handler: postAdminUploadAvatarRoute
	}),
	defineRouteTool({
		name: 'units_delete_avatar',
		title: 'Remove unit avatar',
		description: 'Removes the unit\'s avatar from the public site. Irreversible; the image is not kept.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		method: 'DELETE',
		path: '/api/admin/units/{unitId}/avatar',
		pathParams: { unitId },
		handler: deleteAdminAvatarRoute
	}),
	defineRouteTool({
		name: 'sanctions_list',
		title: 'List sanctions',
		description:
			'Lists sanctions (site bans, server bans, strikes), newest first, 50 per page, with player callsign, reason, expiry, creating admin and cancellation details, plus per-type counts.',
		annotations: { readOnlyHint: true },
		method: 'GET',
		path: '/api/admin/sanctions',
		query: {
			type: z.enum(['site_ban', 'server_ban', 'strike']).optional().describe('Defaults to all types.'),
			q: z.string().optional().describe('Free-text search.'),
			page
		},
		handler: getAdminSanctionsRoute
	}),
	defineRouteTool({
		name: 'sanctions_create',
		title: 'Sanction player',
		description:
			'Sanctions a user (user id from users_list): "site_ban" locks them out of the site, "server_ban" makes the game server refuse them and blocks game sign-ups, "strike" is a warning that expires after one month. durationMinutes sets a ban\'s length (null or omitted = permanent) and is ignored for strikes; a third active strike automatically adds a 7-day server ban and closes the strikes. Posts to the Discord sanctions channel and shows on the public sanctions list.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
		method: 'POST',
		path: '/api/admin/sanctions',
		body: createSanctionSchema,
		handler: postAdminCreateSanctionRoute
	}),
	defineRouteTool({
		name: 'sanctions_cancel',
		title: 'Cancel sanction',
		description:
			'Cancels an active sanction early with a required reason, lifting the ban or strike. Posts the cancellation to Discord.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
		method: 'POST',
		path: '/api/admin/sanctions/{sanctionId}/cancel',
		pathParams: { sanctionId },
		body: cancelSanctionSchema,
		handler: postAdminCancelSanctionRoute
	}),
	defineRouteTool({
		name: 'sanctions_update_expiry',
		title: 'Change sanction expiry',
		description:
			'Overwrites when a sanction expires. expiresAt is UTC as "YYYY-MM-DD HH:MM:SS" (no time zone suffix) and must be in the future; null makes it permanent. Posts the change to Discord.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
		method: 'POST',
		path: '/api/admin/sanctions/{sanctionId}/expiry',
		pathParams: { sanctionId },
		body: updateExpirySchema,
		handler: postAdminUpdateSanctionExpiryRoute
	}),
	defineRouteTool({
		name: 'rotation_get',
		title: 'Show rotation',
		description:
			'Shows the weekly unit rotation: the two sides\' names and colours, the units assigned to each side in order, and the commander schedule (dated pairs of side A and side B units).',
		annotations: { readOnlyHint: true },
		method: 'GET',
		path: '/api/admin/rotation',
		handler: getAdminRotationRoute
	}),
	defineRouteTool({
		name: 'rotation_update',
		title: 'Update rotation',
		description:
			'Takes a single body argument whose action selects the change, each replacing that part of the public rotation wholesale: "updateConfig" (sideAName, sideBName, sideAColor, sideBColor as #RRGGBB), "updateSides" (sideA and sideB: ordered unit ids, verified units with slots only; drops schedule pairs whose units left their side), "updateCommanderSchedule" (pairs of sideAUnitId, sideBUnitId, scheduledDate YYYY-MM-DD, each unit already on that side). Returns the updated rotation.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		method: 'PUT',
		path: '/api/admin/rotation',
		body: updateRotationRequestSchema,
		handler: putAdminRotationRoute
	})
];
