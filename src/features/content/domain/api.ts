import { z } from 'zod';
import type { ContentSettings } from './types';

const localeTextSchema = z.object({
	en: z.string(),
	ru: z.string(),
	uk: z.string(),
	ar: z.string()
});

const upcomingGamesSchema = z.object({
	enabled: z.boolean(),
	startsAt: z.string().nullable(),
	text: localeTextSchema
});

const contentSettingsSchema = z.object({
	success: z.literal(true),
	upcomingGames: upcomingGamesSchema
});

const contentErrorSchema = z.object({
	error: z.string()
});

export type ContentSettingsPayload = ContentSettings;

export type ContentSettingsResponse = ContentSettingsPayload | { error: string };

export function parseContentSettingsResponse(input: unknown): ContentSettingsResponse | null {
	const success = contentSettingsSchema.safeParse(input);
	if (success.success) {
		return { upcomingGames: success.data.upcomingGames };
	}

	const error = contentErrorSchema.safeParse(input);
	if (error.success) {
		return error.data;
	}

	return null;
}
