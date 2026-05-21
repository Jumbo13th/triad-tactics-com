import { z } from 'zod';

const armaIdSuccessSchema = z.object({
	ok: z.literal(true)
});

const armaIdErrorSchema = z.object({
	ok: z.literal(false),
	error: z.enum([
		'not_authenticated',
		'invalid_request',
		'duplicate',
		'not_found',
		'server_error'
	])
});

export type ArmaIdSubmitResponse =
	| { kind: 'success' }
	| {
			kind: 'error';
			error:
				| 'not_authenticated'
				| 'invalid_request'
				| 'duplicate'
				| 'not_found'
				| 'server_error';
	  };

export function parseArmaIdSubmitResponse(input: unknown): ArmaIdSubmitResponse | null {
	const success = armaIdSuccessSchema.safeParse(input);
	if (success.success) {
		return { kind: 'success' };
	}
	const error = armaIdErrorSchema.safeParse(input);
	if (error.success) {
		return { kind: 'error', error: error.data.error };
	}
	return null;
}
