import { z } from 'zod';

const callsignCheckOk = z.object({
	ok: z.literal(true),
	normalized: z.string(),
	exactMatches: z.array(z.string()),
	soundMatches: z.array(z.string())
});

const callsignCheckError = z.object({
	ok: z.literal(false),
	error: z.enum(['invalid_request', 'server_error'])
});

const callsignSearchOk = z.object({
	ok: z.literal(true),
	query: z.string(),
	results: z.array(z.string()),
	total: z.number()
});

const callsignSearchError = z.object({
	ok: z.literal(false),
	error: z.enum(['invalid_request', 'server_error'])
});

export const callsignCheckResponseSchema = z.discriminatedUnion('ok', [
	callsignCheckOk,
	callsignCheckError
]);

export const callsignSearchResponseSchema = z.discriminatedUnion('ok', [
	callsignSearchOk,
	callsignSearchError
]);

export type CallsignCheckResponse = z.infer<typeof callsignCheckResponseSchema>;
export type CallsignSearchResponse = z.infer<typeof callsignSearchResponseSchema>;

export function parseCallsignCheckResponse(input: unknown): CallsignCheckResponse | null {
	const parsed = callsignCheckResponseSchema.safeParse(input);
	return parsed.success ? parsed.data : null;
}

export function parseCallsignSearchResponse(input: unknown): CallsignSearchResponse | null {
	const parsed = callsignSearchResponseSchema.safeParse(input);
	return parsed.success ? parsed.data : null;
}
