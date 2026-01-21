import { z } from 'zod';

const renameSuccessSchema = z.object({
	ok: z.literal(true),
	status: z.enum(['created', 'already_pending']),
	requestId: z.unknown().optional()
});

const renameErrorSchema = z.object({
	ok: z.literal(false),
	error: z.enum([
		'not_authenticated',
		'invalid_request',
		'callsign_taken',
		'rename_not_required',
		'duplicate_pending',
		'not_found',
		'server_error'
	])
});

export type RenameSubmitResponse =
	| { kind: 'success'; status: 'created'; requestId?: unknown }
	| { kind: 'success'; status: 'already_pending' }
	| {
			kind: 'error';
			error:
				| 'not_authenticated'
				| 'invalid_request'
				| 'callsign_taken'
				| 'rename_not_required'
				| 'duplicate_pending'
				| 'not_found'
				| 'server_error';
	  };

export function parseRenameSubmitResponse(input: unknown): RenameSubmitResponse | null {
	const success = renameSuccessSchema.safeParse(input);
	if (success.success) {
		if (success.data.status === 'already_pending') {
			return { kind: 'success', status: 'already_pending' };
		}
		return { kind: 'success', status: 'created', requestId: success.data.requestId };
	}
	const error = renameErrorSchema.safeParse(input);
	if (error.success) {
		return { kind: 'error', error: error.data.error };
	}
	return null;
}
