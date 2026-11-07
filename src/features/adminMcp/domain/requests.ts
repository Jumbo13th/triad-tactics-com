import { z } from 'zod';
import { MCP_TOKEN_EXPIRY_DAYS } from './types';

export const createMcpTokenRequestSchema = z.object({
	label: z.string().trim().min(1).max(80),
	expiresInDays: z.literal(MCP_TOKEN_EXPIRY_DAYS)
});

export type CreateMcpTokenRequest = z.infer<typeof createMcpTokenRequestSchema>;
