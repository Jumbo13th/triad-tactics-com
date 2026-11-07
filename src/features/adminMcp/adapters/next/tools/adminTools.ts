import { z } from 'zod';
import { defineRouteTool, type AdminTool } from './defineTool';
import { getAdminApplicationsRoute } from '@/features/admin/adapters/next/listApplicationsRoute';
import { getAdminUsersRoute } from '@/features/admin/adapters/next/listUsersRoute';
import { postConfirmApplicationRoute } from '@/features/admin/adapters/next/confirmApplicationRoute';
import { getAdminRenameRequestsRoute } from '@/features/admin/adapters/next/listRenameRequestsRoute';
import { postDecideRenameRequestRoute } from '@/features/admin/adapters/next/decideRenameRequestRoute';
import { postRenameRequiredRoute } from '@/features/admin/adapters/next/renameRequiredRoute';
import { postApprovedBroadcastRoute } from '@/features/admin/adapters/next/mailingRoute';
import { postRunOutboxRoute } from '@/features/admin/adapters/next/outboxRunRoute';
import { postAdminCronRoute } from '@/features/admin/adapters/next/cronRoute';
import { getAdminConfigRoute } from '@/features/admin/adapters/next/configRoute';
import {
	deleteAdminUserBadgeRoute,
	getAdminBadgesRoute,
	postAdminBadgeDiscordRoleRoute,
	postAdminBadgeStatusRoute,
	postAdminBadgesRoute,
	postAdminUserBadgeRoute
} from '@/features/admin/adapters/next/badgesRoute';
import {
	confirmApplicationRequestSchema,
	createBadgeTypeRequestSchema,
	decideRenameRequestSchema,
	mailingRequestSchema,
	mutateUserBadgeRequestSchema,
	renameRequiredRequestSchema,
	updateBadgeTypeDiscordRoleRequestSchema,
	updateBadgeTypeStatusRequestSchema
} from '@/features/admin/domain/requests';

const positiveId = z.number().int().positive();
const page = z.number().int().positive().optional().describe('1-based page, 50 rows per page.');
const search = z.string().optional().describe('Free-text search.');

export const adminTools: AdminTool[] = [
	defineRouteTool({
		name: 'applications_list',
		title: 'List applications',
		description:
			'Lists membership applications with their answers, contact details and confirmation state, plus per-status counts. Use the returned application id with applications_confirm or mailing_send.',
		annotations: { readOnlyHint: true },
		method: 'GET',
		path: '/api/admin',
		query: {
			status: z.enum(['active', 'archived', 'all']).optional().describe('Defaults to active.'),
			q: search,
			page
		},
		handler: getAdminApplicationsRoute
	}),
	defineRouteTool({
		name: 'applications_confirm',
		title: 'Confirm application',
		description:
			'Confirms an application, which gives the player confirmed access to the site and game. Queues the approval email the first time an application is confirmed.',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
		method: 'POST',
		path: '/api/admin/confirm',
		body: confirmApplicationRequestSchema,
		handler: postConfirmApplicationRoute
	}),
	defineRouteTool({
		name: 'users_list',
		title: 'List users',
		description:
			'Lists registered users with callsign, SteamID64, Discord id, Arma GUID, unit, confirmation and rename state and badges, plus per-status counts. The returned user id is what badge and sanction tools take.',
		annotations: { readOnlyHint: true },
		method: 'GET',
		path: '/api/admin/users',
		query: {
			status: z.enum(['all', 'rename_required', 'confirmed']).optional().describe('Defaults to all.'),
			q: search,
			page
		},
		handler: getAdminUsersRoute
	}),
	defineRouteTool({
		name: 'users_set_rename_required',
		title: 'Require or clear rename',
		description:
			'With action "require" (default), forces the player identified by steamid64 to choose a new callsign before using the site; with action "clear", lifts that requirement. The optional reason is shown to the player.',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		method: 'POST',
		path: '/api/admin/rename-required',
		body: renameRequiredRequestSchema,
		handler: postRenameRequiredRoute
	}),
	defineRouteTool({
		name: 'rename_requests_list',
		title: 'List rename requests',
		description: 'Lists callsign rename requests with the old and requested callsign and their decision state.',
		annotations: { readOnlyHint: true },
		method: 'GET',
		path: '/api/admin/rename-requests',
		query: {
			status: z.enum(['pending', 'approved', 'declined', 'all']).optional().describe('Defaults to pending.'),
			q: search
		},
		handler: getAdminRenameRequestsRoute
	}),
	defineRouteTool({
		name: 'rename_requests_decide',
		title: 'Decide rename request',
		description:
			'Approves (applies the requested callsign) or declines a pending rename request. A decline reason is shown to the player.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		method: 'POST',
		path: '/api/admin/rename-requests/decide',
		body: decideRenameRequestSchema,
		handler: postDecideRenameRequestRoute
	}),
	defineRouteTool({
		name: 'badges_list',
		title: 'List badge types',
		description: 'Lists badge types with status (active/retired), linked Discord role id, and how many users and missions use each.',
		annotations: { readOnlyHint: true },
		method: 'GET',
		path: '/api/admin/badges',
		handler: getAdminBadgesRoute
	}),
	defineRouteTool({
		name: 'badges_create',
		title: 'Create badge type',
		description: 'Creates a new active badge type with the given label.',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
		method: 'POST',
		path: '/api/admin/badges',
		body: createBadgeTypeRequestSchema,
		handler: postAdminBadgesRoute
	}),
	defineRouteTool({
		name: 'badges_set_status',
		title: 'Activate or retire badge type',
		description: 'Sets a badge type to active or retired. Retired badges can no longer be assigned.',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		method: 'POST',
		path: '/api/admin/badges/{badgeTypeId}/status',
		pathParams: { badgeTypeId: positiveId },
		body: updateBadgeTypeStatusRequestSchema,
		handler: postAdminBadgeStatusRoute
	}),
	defineRouteTool({
		name: 'badges_set_discord_role',
		title: 'Link badge to Discord role',
		description:
			'Links a badge type to a Discord role id (17–20 digit snowflake), or unlinks it with null/empty. The role is mentioned in priority-slot Discord announcements for that badge.',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		method: 'POST',
		path: '/api/admin/badges/{badgeTypeId}/discord-role',
		pathParams: { badgeTypeId: positiveId },
		body: updateBadgeTypeDiscordRoleRequestSchema,
		handler: postAdminBadgeDiscordRoleRoute
	}),
	defineRouteTool({
		name: 'users_add_badge',
		title: 'Give badge to user',
		description: 'Assigns an active badge type to a user (user id from users_list).',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		method: 'POST',
		path: '/api/admin/users/{userId}/badges',
		pathParams: { userId: positiveId },
		body: mutateUserBadgeRequestSchema,
		handler: postAdminUserBadgeRoute
	}),
	defineRouteTool({
		name: 'users_remove_badge',
		title: 'Remove badge from user',
		description: 'Removes a badge from a user.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		method: 'DELETE',
		path: '/api/admin/users/{userId}/badges',
		pathParams: { userId: positiveId },
		body: mutateUserBadgeRequestSchema,
		handler: deleteAdminUserBadgeRoute
	}),
	defineRouteTool({
		name: 'mailing_send',
		title: 'Email applicants',
		description:
			'Queues an email to each listed application (ids from applications_list). Applicants who applied in Russian or Ukrainian get the Russian text, everyone else the English. Emails go out on the next outbox run and cannot be recalled.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
		method: 'POST',
		path: '/api/admin/mailing',
		body: mailingRequestSchema,
		handler: postApprovedBroadcastRoute
	}),
	defineRouteTool({
		name: 'outbox_run',
		title: 'Send queued emails',
		description: 'Sends the queued emails now instead of waiting for the scheduled cron.',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
		method: 'POST',
		path: '/api/admin/outbox',
		handler: postRunOutboxRoute
	}),
	defineRouteTool({
		name: 'cron_run',
		title: 'Run scheduled maintenance',
		description:
			'Runs the scheduled maintenance pass now: sends queued emails, prunes mission audit events older than 30 days and posts pending priority-slot Discord announcements.',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
		method: 'POST',
		path: '/api/admin/cron',
		handler: postAdminCronRoute
	}),
	defineRouteTool({
		name: 'config_get',
		title: 'Show email configuration',
		description: 'Shows the email sender settings the site is running with.',
		annotations: { readOnlyHint: true },
		method: 'GET',
		path: '/api/admin/config',
		handler: getAdminConfigRoute
	})
];
