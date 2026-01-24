import { z } from 'zod';

export const submitApplicationLocaleSchema = z.object({
	locale: z.string().trim().min(1).optional()
});

export type SubmitApplicationLocale = z.infer<typeof submitApplicationLocaleSchema>;
