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

export const mailingRequestSchema = z.object({
	applicationIds: z.array(z.number().int().positive()).min(1),
	subjectEn: z.string().trim().min(1).max(200),
	bodyEn: z.string().trim().min(1).max(5000),
	subjectRu: z.string().trim().min(1).max(200),
	bodyRu: z.string().trim().min(1).max(5000)
});

export type ConfirmApplicationRequest = z.infer<typeof confirmApplicationRequestSchema>;
export type DecideRenameRequest = z.infer<typeof decideRenameRequestSchema>;
export type RenameRequiredRequest = z.infer<typeof renameRequiredRequestSchema>;
export type MailingRequest = z.infer<typeof mailingRequestSchema>;
