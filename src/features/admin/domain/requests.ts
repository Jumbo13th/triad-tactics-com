import { z } from 'zod';

export const confirmApplicationRequestSchema = z.object({
	applicationId: z.number().int().positive()
});

export const decideRenameRequestSchema = z.object({
	requestId: z.number().int().positive(),
	decision: z.enum(['approve', 'decline']),
	declineReason: z.string().trim().min(1).optional().nullable()
});

export const renameRequiredRequestSchema = z.object({
	action: z.enum(['require', 'clear']).optional().default('require'),
	steamid64: z.string().trim().min(1),
	reason: z.string().trim().min(1).optional().nullable(),
	applicationId: z.number().int().positive().optional().nullable()
});

export type ConfirmApplicationRequest = z.infer<typeof confirmApplicationRequestSchema>;
export type DecideRenameRequest = z.infer<typeof decideRenameRequestSchema>;
export type RenameRequiredRequest = z.infer<typeof renameRequiredRequestSchema>;
