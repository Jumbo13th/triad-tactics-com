import { getCheckCallsignRoute } from '@/features/callsign/adapters/next/checkCallsignRoute';
import { withApiGuards } from '@/platform/apiGates';

export const GET = withApiGuards(getCheckCallsignRoute, { name: 'api.callsign.check', logSteamId: true });
