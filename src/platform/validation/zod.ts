import { z } from 'zod';

export const sqliteBoolean = z.preprocess((value) => {
	if (value === null || value === undefined) return undefined;
	if (value === 1 || value === '1') return true;
	if (value === 0 || value === '0') return false;
	return value;
}, z.boolean());
