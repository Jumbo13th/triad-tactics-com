import { z } from 'zod';
import { canonicalSlottingSchema } from './slotting';
import { appLocales } from '@/i18n/locales';

const localizedDescriptionSchema = z.object(
	Object.fromEntries(appLocales.map((locale) => [locale, z.string().trim().max(16000)])) as Record<(typeof appLocales)[number], z.ZodString>
);

export const createGameDraftRequestSchema = z.object({
	mode: z.enum(['blank', 'duplicate_previous']).default('blank')
});

function nullableTrimmedString(maxLength: number) {
	return z.preprocess((value) => {
		if (value === null || value === undefined) return null;
		if (typeof value === 'string') {
			const trimmed = value.trim();
			return trimmed === '' ? null : trimmed;
		}
		return value;
	}, z.string().max(maxLength).nullable());
}

function optionalNullableTrimmedString(maxLength: number) {
	return z.preprocess((value) => {
		if (value === undefined) return undefined;
		if (value === null) return null;
		if (typeof value === 'string') {
			const trimmed = value.trim();
			return trimmed === '' ? null : trimmed;
		}
		return value;
	}, z.string().max(maxLength).nullable().optional());
}

const nullableDateTimeSchema = z.preprocess((value) => {
	if (value === null || value === undefined) return null;
	if (typeof value === 'string') {
		const trimmed = value.trim();
		return trimmed === '' ? null : trimmed;
	}
	return value;
}, z.string().datetime({ offset: true }).nullable());

export const shortCodeSchema = nullableTrimmedString(64).refine(
	(value) => value === null || /^[A-Za-z0-9-]+$/.test(value),
	{ message: 'invalid_short_code' }
);

export const updateGameSettingsRequestSchema = z.object({
	settingsRevision: z.number().int().positive(),
	title: z.string().trim().max(200),
	description: localizedDescriptionSchema,
	shortCode: shortCodeSchema,
	startsAt: nullableDateTimeSchema,
	serverName: z.string().trim().max(200),
	serverHost: z.string().trim().max(255),
	serverPort: z.number().int().min(1).max(65535).nullable(),
	earlyPassword: optionalNullableTrimmedString(200),
	finalPassword: optionalNullableTrimmedString(200),
	priorityClaimOpensAt: nullableDateTimeSchema,
	priorityClaimManualState: z.enum(['default', 'open', 'closed']),
	unitSlottingManualState: z.enum(['closed', 'open']),
	regularJoinEnabled: z.boolean(),
	serverDetailsHidden: z.boolean(),
	priorityBadgeTypeIds: z.array(z.number().int().positive()).max(100).transform((ids) => [...new Set(ids)])
});

export const publishGameRequestSchema = z.object({
	settingsRevision: z.number().int().positive()
});

export const updateGameSlottingRequestSchema = z.object({
	slottingRevision: z.number().int().positive(),
	slotting: canonicalSlottingSchema,
	confirmDestructive: z.boolean().optional().default(false)
});

export const claimPrioritySlotRequestSchema = z.object({
	slotId: z.string().trim().min(1)
});

export const archiveGameRequestSchema = z.object({
	result: z.object({
		winnerSideId: z.preprocess((value) => {
			if (value === null || value === undefined) return null;
			if (typeof value === 'string') {
				const trimmed = value.trim();
				return trimmed === '' ? null : trimmed;
			}
			return value;
		}, z.string().min(1).max(120).nullable()),
		sideScores: z
			.array(
				z.object({
					sideId: z.string().trim().min(1).max(120),
					score: z.number().int().min(0)
				})
			)
			.max(32)
			.default([])
	})
});

export const cancelGameRequestSchema = z.object({
	reason: z.string().trim().min(1).max(1000)
});

export const deleteArchivedMissionRequestSchema = z.object({
	titleConfirmation: z.string().trim().min(1).max(200)
});

export const createMissionUpdateRequestSchema = z.object({
	kind: z.enum([
		'units_slotting_started',
		'priority_slotting_started',
		'regular_slotting_started',
		'game_started_wait_next_episode'
	]),
	episodeNumber: z.number({ error: 'episode_required' }).int().positive(),
	totalEpisodes: z.number().int().positive().default(3)
}).superRefine((value, ctx) => {
	if (!Number.isInteger(value.episodeNumber) || value.episodeNumber < 1) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['episodeNumber'],
			message: 'episode_required'
		});
	}

	if (!Number.isInteger(value.totalEpisodes) || value.totalEpisodes < value.episodeNumber) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['totalEpisodes'],
			message: 'total_episodes_before_episode'
		});
	}
});

export const updateMissionUpdateRequestSchema = z.object({
	kind: z.enum([
		'units_slotting_started',
		'priority_slotting_started',
		'regular_slotting_started',
		'game_started_wait_next_episode'
	]),
	episodeNumber: z.number({ error: 'episode_required' }).int().positive(),
	totalEpisodes: z.number().int().positive()
}).superRefine((value, ctx) => {
	if (!Number.isInteger(value.episodeNumber) || value.episodeNumber < 1) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['episodeNumber'],
			message: 'episode_required'
		});
	}

	if (!Number.isInteger(value.totalEpisodes) || value.totalEpisodes < value.episodeNumber) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['totalEpisodes'],
			message: 'total_episodes_before_episode'
		});
	}
});

export type UpdateGameSettingsRequest = z.infer<typeof updateGameSettingsRequestSchema>;
export type PublishGameRequest = z.infer<typeof publishGameRequestSchema>;
export type UpdateGameSlottingRequest = z.infer<typeof updateGameSlottingRequestSchema>;
export type ClaimPrioritySlotRequest = z.infer<typeof claimPrioritySlotRequestSchema>;
export type ArchiveGameRequest = z.infer<typeof archiveGameRequestSchema>;
export type CancelGameRequest = z.infer<typeof cancelGameRequestSchema>;
export type DeleteArchivedMissionRequest = z.infer<typeof deleteArchivedMissionRequestSchema>;
export type CreateMissionUpdateRequest = z.infer<typeof createMissionUpdateRequestSchema>;
export type UpdateMissionUpdateRequest = z.infer<typeof updateMissionUpdateRequestSchema>;

export const updateUnitAssignmentsRequestSchema = z.object({
	assignments: z.array(z.object({
		unitId: z.number().int().positive(),
		sideId: z.string().trim().min(1)
	})).max(50)
});

export const claimUnitSlotRequestSchema = z.object({
	slotId: z.string().trim().min(1)
});

export const releaseUnitSlotRequestSchema = z.object({
	slotId: z.string().trim().min(1)
});

export type UpdateUnitAssignmentsRequest = z.infer<typeof updateUnitAssignmentsRequestSchema>;
export type ClaimUnitSlotRequest = z.infer<typeof claimUnitSlotRequestSchema>;
export type ReleaseUnitSlotRequest = z.infer<typeof releaseUnitSlotRequestSchema>;
