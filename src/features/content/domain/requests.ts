import { z } from 'zod';

const localeTextSchema = z.object({
	en: z.string(),
	ru: z.string(),
	uk: z.string(),
	ar: z.string()
});

export const contentSettingsRequestSchema = z.object({
	upcomingGames: z.object({
		enabled: z.boolean(),
		startsAt: z.string().nullable(),
		text: localeTextSchema
	})
});
