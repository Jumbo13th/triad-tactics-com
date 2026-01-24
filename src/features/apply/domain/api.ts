import { z } from 'zod';

const submitSuccessSchema = z.object({
	success: z.literal(true),
	id: z.number()
});

const submitErrorSchema = z.object({
	error: z.enum([
		'validation_error',
		'steam_not_connected',
		'steam_required',
		'steam_game_not_detected',
		'steam_api_unavailable',
		'rate_limited',
		'duplicate',
		'server_error'
	])
}).and(z.object({
	retryAfterSeconds: z.number().optional(),
	submittedAt: z.string().nullable().optional(),
	details: z.unknown().optional()
}));

export type SubmitApplicationResponse =
	| { kind: 'success'; id: number }
	| {
			kind: 'error';
			error:
				| 'validation_error'
				| 'steam_not_connected'
				| 'steam_required'
				| 'steam_game_not_detected'
				| 'steam_api_unavailable'
				| 'rate_limited'
				| 'duplicate'
				| 'server_error';
			retryAfterSeconds?: number;
			submittedAt?: string | null;
			details?: unknown;
	  };

export function parseSubmitApplicationResponse(input: unknown): SubmitApplicationResponse | null {
	const success = submitSuccessSchema.safeParse(input);
	if (success.success) {
		return { kind: 'success', id: success.data.id };
	}
	const error = submitErrorSchema.safeParse(input);
	if (error.success) {
		return {
			kind: 'error',
			error: error.data.error,
			retryAfterSeconds: error.data.retryAfterSeconds,
			submittedAt: error.data.submittedAt,
			details: error.data.details
		};
	}
	return null;
}
