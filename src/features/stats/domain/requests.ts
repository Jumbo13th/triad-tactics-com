import { z } from 'zod';

const mappingSchema = z.object({
	guidUnit: z.record(z.string(), z.number().int().positive().nullable()),
	winner: z.string().default(''),
	commanders: z.array(z.object({ faction: z.string().min(1), unitId: z.number().int().positive() })).default([]),
});

export const adminStatsRequestSchema = z.discriminatedUnion('action', [
	z.object({
		action: z.literal('upload'),
		missionId: z.number().int().positive(),
		episodeNumber: z.number().int().min(1).default(1),
		snapshotText: z.string().min(2),
		// Replace an existing draft for the same mission episode.
		replaceDraft: z.boolean().default(false),
	}),
	z.object({
		action: z.literal('updateMapping'),
		gameStatsId: z.number().int().positive(),
		mapping: mappingSchema,
	}),
	z.object({
		action: z.literal('publish'),
		gameStatsId: z.number().int().positive(),
	}),
	z.object({
		action: z.literal('unpublish'),
		gameStatsId: z.number().int().positive(),
	}),
	z.object({
		action: z.literal('deleteDraft'),
		gameStatsId: z.number().int().positive(),
	}),
	z.object({
		action: z.literal('createSeason'),
		name: z.string().trim().min(1).max(80),
	}),
	z.object({
		action: z.literal('closeSeason'),
		seasonId: z.number().int().positive(),
	}),
]);

export type AdminStatsRequest = z.infer<typeof adminStatsRequestSchema>;
export type MappingInput = z.infer<typeof mappingSchema>;
