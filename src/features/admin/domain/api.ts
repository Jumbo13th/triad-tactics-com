import { z } from 'zod';
import type { Application } from '@/features/apply/domain/types';
import type { AdminRenameRequestRow, AdminUserRow } from './types';
import { sqliteBoolean } from '@/platform/validation/zod';

const adminDisconnectedSchema = z.object({
	connected: z.literal(false),
	isAdmin: z.literal(false)
});

const adminConnectedSchema = z.object({
	connected: z.literal(true),
	isAdmin: z.boolean(),
	steamid64: z.string(),
	personaName: z.string().nullable(),
	callsign: z.string().nullable()
});

export type AdminStatus =
	| { connected: false; isAdmin: false }
	| {
			connected: true;
			isAdmin: boolean;
			steamid64: string;
			personaName: string | null;
			callsign: string | null;
	  };

export function parseAdminStatusResponse(input: unknown): AdminStatus | null {
	const connected = adminConnectedSchema.safeParse(input);
	if (connected.success) {
		return connected.data;
	}

	const disconnected = adminDisconnectedSchema.safeParse(input);
	if (disconnected.success) {
		return disconnected.data;
	}

	return null;
}

const applicationAnswersSchema = z.object({
	callsign: z.string(),
	name: z.string(),
	age: z.string(),
	city: z.string(),
	country: z.string(),
	availability: z.string(),
	timezone: z.string(),
	experience: z.string(),
	motivation: z.string(),
	verified_game_access: sqliteBoolean.optional()
});

const applicationSchema = z.object({
	id: z.number().optional(),
	user_id: z.number().nullable().optional(),
	email: z.string(),
	steamid64: z.string(),
	persona_name: z.string().nullable().optional(),
	answers: applicationAnswersSchema,
	ip_address: z.string().optional(),
	locale: z.string().optional(),
	created_at: z.string().optional(),
	confirmed_at: z.string().nullable().optional(),
	confirmed_by_steamid64: z.string().nullable().optional(),
	approval_email_sent_at: z.string().nullable().optional()
});

const adminUserRowSchema = z.object({
	id: z.number(),
	created_at: z.string().optional(),
	player_confirmed_at: z.string().nullable().optional(),
	confirmed_application_id: z.number().nullable().optional(),
	current_callsign: z.string().nullable().optional(),
	rename_required_at: z.string().nullable().optional(),
	rename_required_reason: z.string().nullable().optional(),
	rename_required_by_steamid64: z.string().nullable().optional(),
	has_pending_rename_request: sqliteBoolean,
	steamid64: z.string().nullable().optional()
});

const adminRenameRequestRowSchema = z.object({
	id: z.number(),
	user_id: z.number(),
	old_callsign: z.string().nullable().optional(),
	new_callsign: z.string(),
	status: z.enum(['pending', 'approved', 'declined']),
	created_at: z.string().optional(),
	decided_at: z.string().nullable().optional(),
	decided_by_steamid64: z.string().nullable().optional(),
	decline_reason: z.string().nullable().optional(),
	current_callsign: z.string().nullable().optional(),
	rename_required_at: z.string().nullable().optional(),
	steamid64: z.string().nullable().optional()
});

const adminApplicationsSuccessSchema = z.object({
	success: z.literal(true),
	count: z.number(),
	counts: z.object({
		active: z.number(),
		archived: z.number(),
		total: z.number()
	}),
	applications: z.array(applicationSchema)
});

const adminUsersSuccessSchema = z.object({
	success: z.literal(true),
	count: z.number(),
	counts: z.object({
		all: z.number(),
		renameRequired: z.number(),
		confirmed: z.number()
	}),
	users: z.array(adminUserRowSchema)
});

const adminRenameRequestsSuccessSchema = z.object({
	success: z.literal(true),
	count: z.number(),
	renameRequests: z.array(adminRenameRequestRowSchema)
});

const adminErrorSchema = z.object({
	error: z.string()
});

export type AdminApplicationsView =
	| { success: true; count: number; counts: { active: number; archived: number; total: number }; applications: Application[] }
	| { error: string };

export type AdminUsersView =
	| { success: true; count: number; counts: { all: number; renameRequired: number; confirmed: number }; users: AdminUserRow[] }
	| { error: string };

export type AdminRenameRequestsView =
	| { success: true; count: number; renameRequests: AdminRenameRequestRow[] }
	| { error: string };

export function parseAdminApplicationsResponse(input: unknown): AdminApplicationsView | null {
	const success = adminApplicationsSuccessSchema.safeParse(input);
	if (success.success) {
		return success.data;
	}
	const error = adminErrorSchema.safeParse(input);
	if (error.success) {
		return error.data;
	}
	return null;
}

export function parseAdminUsersResponse(input: unknown): AdminUsersView | null {
	const success = adminUsersSuccessSchema.safeParse(input);
	if (success.success) {
		return success.data;
	}
	const error = adminErrorSchema.safeParse(input);
	if (error.success) {
		return error.data;
	}
	return null;
}

export function parseAdminRenameRequestsResponse(input: unknown): AdminRenameRequestsView | null {
	const success = adminRenameRequestsSuccessSchema.safeParse(input);
	if (success.success) {
		return success.data;
	}
	const error = adminErrorSchema.safeParse(input);
	if (error.success) {
		return error.data;
	}
	return null;
}
