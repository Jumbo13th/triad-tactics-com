import { z } from 'zod';

const mcpTokenSummarySchema = z.object({
	id: z.number(),
	steamid64: z.string(),
	ownerCallsign: z.string().nullable(),
	label: z.string(),
	hint: z.string(),
	createdAt: z.string(),
	expiresAt: z.string(),
	lastUsedAt: z.string().nullable(),
	revokedAt: z.string().nullable(),
	state: z.enum(['active', 'expired', 'revoked'])
});

const mcpTokensResponseSchema = z.object({
	success: z.literal(true),
	viewerSteamid64: z.string(),
	maxActivePerAdmin: z.number(),
	tokens: z.array(mcpTokenSummarySchema)
});

const mcpTokenCreatedResponseSchema = z.object({
	success: z.literal(true),
	token: z.string(),
	summary: mcpTokenSummarySchema
});

export type McpTokensResponse = z.infer<typeof mcpTokensResponseSchema>;
export type McpTokenCreatedResponse = z.infer<typeof mcpTokenCreatedResponseSchema>;

export function parseMcpTokensResponse(input: unknown): McpTokensResponse | null {
	const parsed = mcpTokensResponseSchema.safeParse(input);
	return parsed.success ? parsed.data : null;
}

export function parseMcpTokenCreatedResponse(input: unknown): McpTokenCreatedResponse | null {
	const parsed = mcpTokenCreatedResponseSchema.safeParse(input);
	return parsed.success ? parsed.data : null;
}
