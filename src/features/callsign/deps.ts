import { dbOperations } from '@/platform/db';
import type { CallsignDeps } from './ports';

export const callsignDeps: CallsignDeps = {
	repo: {
		listCallsigns: (scope) => dbOperations.listCallsigns(scope)
	}
};
