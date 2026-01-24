import { listCallsigns } from '@/features/callsign/infra/sqliteCallsigns';
import type { CallsignDeps } from './ports';

export const callsignDeps: CallsignDeps = {
	repo: {
		listCallsigns: (scope) => listCallsigns(scope)
	}
};
