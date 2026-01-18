import { getSearchCallsignRoute } from '@/features/callsign/adapters/next/searchCallsignRoute';
import { withApiGuards } from '@/platform/apiGates';

export const GET = withApiGuards(getSearchCallsignRoute, { name: 'api.callsign.search' });
