import { z } from 'zod';

const ARMA_GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const armaGuidSchema = z
	.string()
	.trim()
	.min(1, 'required')
	.refine((v) => ARMA_GUID_REGEX.test(v), 'armaGuidInvalidFormat');
