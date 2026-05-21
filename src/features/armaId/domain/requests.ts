import { z } from 'zod';
import { armaGuidSchema } from './armaGuidSchema';

export const setArmaGuidRequestSchema = z.object({
	armaGuid: armaGuidSchema
});

export type SetArmaGuidRequest = z.infer<typeof setArmaGuidRequestSchema>;
