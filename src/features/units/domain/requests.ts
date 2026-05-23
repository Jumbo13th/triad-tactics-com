import { z } from 'zod';

export const createUnitRequestSchema = z.object({
	name: z.string().trim().min(2).max(20),
	tag: z.string().trim().min(1).max(6).regex(/^[A-Za-z0-9]+$/),
	description: z.string().trim().max(2000).optional().default(''),
	memberNames: z.string().trim().min(10).max(2000),
	history: z.string().trim().min(20).max(4000),
	otherProjects: z.string().trim().min(5).max(2000),
	acceptSundaySchedule: z.literal(true),
	acceptSideCommanderRole: z.literal(true)
});

export type CreateUnitRequest = z.infer<typeof createUnitRequestSchema>;

export const updateUnitRequestSchema = z.object({
	name: z.string().trim().min(2).max(20).optional(),
	tag: z.string().trim().min(1).max(6).regex(/^[A-Za-z0-9]+$/).optional(),
	description: z.string().trim().max(2000).optional(),
	joinMessage: z.string().trim().max(2000).optional()
});

export type UpdateUnitRequest = z.infer<typeof updateUnitRequestSchema>;

export const adminVerifyUnitRequestSchema = z.object({
	action: z.enum(['verify', 'unverify', 'delete'])
});

export type AdminVerifyUnitRequest = z.infer<typeof adminVerifyUnitRequestSchema>;

export const adminSetSlotsRequestSchema = z.object({
	slotsAllocated: z.number().int().min(0).max(100)
});

export type AdminSetSlotsRequest = z.infer<typeof adminSetSlotsRequestSchema>;

export const adminSetLeaderRequestSchema = z.object({
	userId: z.number().int().positive()
});

export type AdminSetLeaderRequest = z.infer<typeof adminSetLeaderRequestSchema>;

export const manageMemberRequestSchema = z.object({
	userId: z.number().int().positive(),
	action: z.enum(['approve', 'reject', 'remove', 'set_role']),
	role: z.enum(['member', 'applicant', 'deputy']).optional()
});

export type ManageMemberRequest = z.infer<typeof manageMemberRequestSchema>;

export const uploadAvatarRequestSchema = z.object({
	data: z.string().min(1),
	mime: z.enum(['image/png', 'image/jpeg', 'image/webp'])
});

export type UploadAvatarRequest = z.infer<typeof uploadAvatarRequestSchema>;

const MAX_AVATAR_BASE64_SIZE = 350_000;

export function validateAvatarSize(base64Data: string): boolean {
	return base64Data.length <= MAX_AVATAR_BASE64_SIZE;
}

/**
 * Validate that base64 data starts with valid image magic bytes.
 * Prevents storing non-image data (HTML, SVG with scripts, polyglot files).
 */
export function validateImageMagicBytes(base64Data: string, declaredMime: string): boolean {
	try {
		const bytes = Buffer.from(base64Data, 'base64');
		if (bytes.length < 8) return false;

		if (declaredMime === 'image/png') {
			return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
		}

		if (declaredMime === 'image/jpeg') {
			return bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
		}

		if (declaredMime === 'image/webp') {
			return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
				bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
		}

		return false;
	} catch {
		return false;
	}
}
