import { z } from 'zod';

export const callsignSchema = z
	.string()
	.trim()
	.min(1, 'required')
	.min(3, 'minLength')
	.max(12, 'maxLength')
	.refine((v) => /^[A-Za-z0-9_]+$/.test(v), 'callsignInvalidChars');
