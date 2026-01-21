import { z } from 'zod';
import { callsignSchema } from '@/features/callsign/domain/callsignSchema';

export const renameRequestSchema = z.object({
	callsign: callsignSchema
});

export type RenameRequest = z.infer<typeof renameRequestSchema>;
