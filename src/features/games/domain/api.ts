import { z } from 'zod';
import { canonicalSlottingSchema } from './slotting';
import type { GameAuditPayload } from './types';
import { appLocales } from '@/i18n/locales';

const localizedDescriptionSchema = z.object(
	Object.fromEntries(appLocales.map((locale) => [locale, z.string()])) as Record<(typeof appLocales)[number], z.ZodString>
);

const adminGameArchiveSideScoreSchema = z.object({
	sideId: z.string(),
	sideName: z.string(),
	score: z.number().int()
});

const adminGameArchiveResultSchema = z.object({
	outcome: z.enum(['winner', 'draw']),
	winnerSideId: z.string().nullable(),
	sideScores: z.array(adminGameArchiveSideScoreSchema)
});

const adminGameMissionOverviewSchema = z.object({
	id: z.number().int().positive(),
	shortCode: z.string().nullable(),
	status: z.enum(['draft', 'published', 'archived']),
	title: z.string(),
	description: localizedDescriptionSchema,
	startsAt: z.string().nullable(),
	serverName: z.string(),
	serverHost: z.string(),
	serverPort: z.number().int().nullable(),
	priorityClaimOpensAt: z.string().nullable(),
	priorityClaimManualState: z.enum(['default', 'open', 'closed']),
	regularJoinEnabled: z.boolean(),
	priorityGameplayReleasedAt: z.string().nullable(),
	regularGameplayReleasedAt: z.string().nullable(),
	publishedAt: z.string().nullable(),
	archivedAt: z.string().nullable(),
	archiveStatus: z.enum(['completed', 'canceled']).nullable(),
	archiveReason: z.string().nullable(),
	archiveResult: adminGameArchiveResultSchema.nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
	slottingRevision: z.number().int().positive(),
	settingsRevision: z.number().int().positive(),
	earlyPassword: z.string().nullable(),
	finalPassword: z.string().nullable(),
	serverDetailsHidden: z.boolean(),
	priorityBadgeTypeIds: z.array(z.number().int().positive()),
	updates: z.array(
		z.object({
			id: z.number().int().positive(),
			kind: z.enum([
				'units_slotting_started',
				'priority_slotting_started',
				'regular_slotting_started',
				'game_started_wait_next_episode'
			]),
			episodeNumber: z.number().int().positive().nullable(),
			totalEpisodes: z.number().int().positive().nullable(),
			createdAt: z.string(),
			createdBySteamId64: z.string().nullable()
		})
	)
});

const adminGameMissionDetailSchema = adminGameMissionOverviewSchema.extend({
	createdBySteamId64: z.string().nullable(),
	updatedBySteamId64: z.string().nullable(),
	publishedBySteamId64: z.string().nullable(),
	archivedBySteamId64: z.string().nullable(),
	slotting: canonicalSlottingSchema
});

const publishValidationReasonSchema = z.enum([
	'slotting_invalid',
	'short_code_required',
	'short_code_invalid',
	'starts_at_required',
	'server_name_required',
	'server_host_required',
	'server_port_required',
	'early_password_required',
	'priority_badge_required'
]);

const destructiveChangeReasonSchema = z.enum([
	'occupied_slot_removed',
	'occupied_slot_access_changed',
	'occupied_slot_claimant_replaced'
]);

const destructiveChangeSchema = z.object({
	slotId: z.string(),
	sideName: z.string(),
	squadName: z.string(),
	role: z.string(),
	reason: destructiveChangeReasonSchema,
	occupantUserId: z.number().int().positive()
});

const adminGamesValidationIssueSchema = z.object({
	code: z.string(),
	path: z.array(z.union([z.string(), z.number()])),
	message: z.string(),
	minimum: z.number().optional(),
	maximum: z.number().optional()
});

const gameAuditPayloadSchema: z.ZodType<GameAuditPayload> = z.lazy(() =>
	z.union([
		z.null(),
		z.boolean(),
		z.number(),
		z.string(),
		z.array(gameAuditPayloadSchema),
		z.record(z.string(), gameAuditPayloadSchema)
	])
);

const adminGameAuditEventSchema = z.object({
	id: z.number().int().positive(),
	eventType: z.string(),
	createdAt: z.string(),
	actorUserId: z.number().int().nullable(),
	actorSteamId64: z.string().nullable(),
	actorCallsign: z.string().nullable(),
	payload: gameAuditPayloadSchema
});

const adminGamesOverviewSuccessSchema = z.object({
	success: z.literal(true),
	draft: adminGameMissionOverviewSchema.nullable(),
	published: adminGameMissionOverviewSchema.nullable(),
	archivedMissions: z.array(adminGameMissionOverviewSchema)
});

const adminGameDraftSuccessSchema = z.object({
	success: z.literal(true),
	mission: adminGameMissionOverviewSchema
});

const adminGameMissionSuccessSchema = z.object({
	success: z.literal(true),
	mission: adminGameMissionDetailSchema
});

const adminGameAuditSuccessSchema = z.object({
	success: z.literal(true),
	events: z.array(adminGameAuditEventSchema)
});

const adminGamesErrorSchema = z.object({
	error: z.string(),
	reasons: z.array(publishValidationReasonSchema).optional(),
	destructiveChanges: z.array(destructiveChangeSchema).optional(),
	details: z.array(adminGamesValidationIssueSchema).optional()
});

export type AdminGameMissionOverview = z.infer<typeof adminGameMissionOverviewSchema>;
export type AdminGameMissionDetail = z.infer<typeof adminGameMissionDetailSchema>;
export type AdminGamesValidationIssue = z.infer<typeof adminGamesValidationIssueSchema>;
export type AdminGamesErrorView = z.infer<typeof adminGamesErrorSchema>;

export type AdminGamesOverviewView =
	| z.infer<typeof adminGamesOverviewSuccessSchema>
	| AdminGamesErrorView;

export type AdminGameDraftMutationView =
	| z.infer<typeof adminGameDraftSuccessSchema>
	| AdminGamesErrorView;

export type AdminGameMissionResponse = z.infer<typeof adminGameMissionSuccessSchema> | AdminGamesErrorView;

export type AdminGameAuditResponse = z.infer<typeof adminGameAuditSuccessSchema> | AdminGamesErrorView;

export function parseAdminGamesOverviewResponse(input: unknown): AdminGamesOverviewView | null {
	const success = adminGamesOverviewSuccessSchema.safeParse(input);
	if (success.success) {
		return success.data;
	}

	const error = adminGamesErrorSchema.safeParse(input);
	if (error.success) {
		return error.data;
	}

	return null;
}

export function parseAdminGameDraftMutationResponse(input: unknown): AdminGameDraftMutationView | null {
	const success = adminGameDraftSuccessSchema.safeParse(input);
	if (success.success) {
		return success.data;
	}

	const error = adminGamesErrorSchema.safeParse(input);
	if (error.success) {
		return error.data;
	}

	return null;
}

export function parseAdminGameMissionResponse(input: unknown): AdminGameMissionResponse | null {
	const success = adminGameMissionSuccessSchema.safeParse(input);
	if (success.success) {
		return success.data;
	}

	const error = adminGamesErrorSchema.safeParse(input);
	if (error.success) {
		return error.data;
	}

	return null;
}

export function parseAdminGameAuditResponse(input: unknown): AdminGameAuditResponse | null {
	const success = adminGameAuditSuccessSchema.safeParse(input);
	if (success.success) {
		return success.data;
	}

	const error = adminGamesErrorSchema.safeParse(input);
	if (error.success) {
		return error.data;
	}

	return null;
}
