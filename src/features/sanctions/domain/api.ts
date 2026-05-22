import { z } from 'zod';

const sanctionTypeSchema = z.enum(['site_ban', 'server_ban', 'strike']);

const sanctionWithCallsignSchema = z.object({
	id: z.number(),
	user_id: z.number(),
	type: sanctionTypeSchema,
	reason: z.string(),
	expires_at: z.string().nullable(),
	created_at: z.string(),
	created_by_steamid64: z.string(),
	cancelled_at: z.string().nullable(),
	cancelled_by_steamid64: z.string().nullable(),
	cancelled_reason: z.string().nullable(),
	auto_generated: z.number(),
	callsign: z.string().nullable(),
	created_by_callsign: z.string().nullable(),
	cancelled_by_callsign: z.string().nullable(),
	original_expires_at: z.string().nullable(),
	expires_updated_by_steamid64: z.string().nullable(),
	expires_updated_by_callsign: z.string().nullable()
});

const publicSanctionEntrySchema = z.object({
	id: z.number(),
	callsign: z.string().nullable(),
	type: sanctionTypeSchema,
	reason: z.string(),
	expires_at: z.string().nullable(),
	created_at: z.string(),
	cancelled_at: z.string().nullable(),
	cancelled_reason: z.string().nullable(),
	auto_generated: z.number(),
	issued_by: z.string().nullable(),
	cancelled_by: z.string().nullable(),
	original_expires_at: z.string().nullable(),
	expires_updated_by: z.string().nullable()
});

const adminSanctionsResponseSchema = z.object({
	success: z.literal(true),
	sanctions: z.array(sanctionWithCallsignSchema),
	total: z.number(),
	page: z.number(),
	pageSize: z.number(),
	totalPages: z.number(),
	counts: z.object({
		all: z.number(),
		site_ban: z.number(),
		server_ban: z.number(),
		strike: z.number()
	})
});

export type AdminSanctionsResponse = z.infer<typeof adminSanctionsResponseSchema>;

export function parseAdminSanctionsResponse(input: unknown): AdminSanctionsResponse | null {
	const result = adminSanctionsResponseSchema.safeParse(input);
	return result.success ? result.data : null;
}

const publicSanctionsResponseSchema = z.object({
	success: z.literal(true),
	sanctions: z.array(publicSanctionEntrySchema),
	total: z.number(),
	page: z.number(),
	pageSize: z.number(),
	totalPages: z.number()
});

export type PublicSanctionsResponse = z.infer<typeof publicSanctionsResponseSchema>;

export function parsePublicSanctionsResponse(input: unknown): PublicSanctionsResponse | null {
	const result = publicSanctionsResponseSchema.safeParse(input);
	return result.success ? result.data : null;
}

const userSanctionsResponseSchema = z.object({
	success: z.literal(true),
	sanctions: z.array(publicSanctionEntrySchema)
});

export type UserSanctionsResponse = z.infer<typeof userSanctionsResponseSchema>;

export function parseUserSanctionsResponse(input: unknown): UserSanctionsResponse | null {
	const result = userSanctionsResponseSchema.safeParse(input);
	return result.success ? result.data : null;
}

const createSanctionResponseSchema = z.union([
	z.object({ success: z.literal(true) }),
	z.object({ success: z.literal(false), error: z.string() })
]);

export type CreateSanctionResponse = z.infer<typeof createSanctionResponseSchema>;

export function parseCreateSanctionResponse(input: unknown): CreateSanctionResponse | null {
	const result = createSanctionResponseSchema.safeParse(input);
	return result.success ? result.data : null;
}

const cancelSanctionResponseSchema = z.union([
	z.object({ success: z.literal(true) }),
	z.object({ success: z.literal(false), error: z.string() })
]);

export type CancelSanctionResponse = z.infer<typeof cancelSanctionResponseSchema>;

export function parseCancelSanctionResponse(input: unknown): CancelSanctionResponse | null {
	const result = cancelSanctionResponseSchema.safeParse(input);
	return result.success ? result.data : null;
}

const updateExpiryResponseSchema = z.union([
	z.object({ success: z.literal(true) }),
	z.object({ success: z.literal(false), error: z.string() })
]);

export type UpdateExpiryResponse = z.infer<typeof updateExpiryResponseSchema>;

export function parseUpdateExpiryResponse(input: unknown): UpdateExpiryResponse | null {
	const result = updateExpiryResponseSchema.safeParse(input);
	return result.success ? result.data : null;
}

export function isActiveSanction(sanction: { cancelled_at: string | null; expires_at: string | null }): boolean {
	if (sanction.cancelled_at) return false;
	if (!sanction.expires_at) return true;
	const exp = sanction.expires_at;
	return new Date(exp.includes('T') || exp.includes('Z') ? exp : exp.replace(' ', 'T') + 'Z') > new Date();
}

const AUTO_REASON_KEYS: Record<string, string> = {
	'3_active_strikes': 'autoReason_3_active_strikes',
	'escalated_to_server_ban': 'autoReason_escalated_to_server_ban'
};

/** Resolve an `auto:` prefixed reason to an i18n key, or return the raw text. */
export function localizeReason(text: string, t: (key: string) => string): string {
	if (!text.startsWith('auto:')) return text;
	const suffix = text.slice(5);
	const key = AUTO_REASON_KEYS[suffix];
	return key ? t(key) : text;
}
