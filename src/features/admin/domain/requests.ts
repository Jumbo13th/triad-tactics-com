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

export const createBadgeTypeRequestSchema = z.object({
	label: z.string().trim().min(1).max(120)
});

export const updateBadgeTypeStatusRequestSchema = z.object({
	status: z.enum(['active', 'retired'])
});

// Discord snowflake IDs are 17-20 digit numeric strings. Constraining the shape
// here prevents arbitrary content (spaces, markup) from later being interpolated
// into a Discord role mention `<@&{id}>`.
const discordSnowflakeSchema = z.string().regex(/^\d{17,20}$/);

export const updateBadgeTypeDiscordRoleRequestSchema = z.object({
	discordRoleId: z.preprocess((value) => {
		if (value === null || value === undefined) return null;
		if (typeof value === 'string') {
			const trimmed = value.trim();
			return trimmed === '' ? null : trimmed;
		}
		return value;
	}, discordSnowflakeSchema.nullable())
});

export const mutateUserBadgeRequestSchema = z.object({
	badgeTypeId: z.number().int().positive()
});

export type ConfirmApplicationRequest = z.infer<typeof confirmApplicationRequestSchema>;
export type DecideRenameRequest = z.infer<typeof decideRenameRequestSchema>;
export type RenameRequiredRequest = z.infer<typeof renameRequiredRequestSchema>;
export type MailingRequest = z.infer<typeof mailingRequestSchema>;
export type CreateBadgeTypeRequest = z.infer<typeof createBadgeTypeRequestSchema>;
export type UpdateBadgeTypeStatusRequest = z.infer<typeof updateBadgeTypeStatusRequestSchema>;
export type MutateUserBadgeRequest = z.infer<typeof mutateUserBadgeRequestSchema>;
