import { postTransferLeadershipRoute } from '@/features/units/adapters/next/unitRoutes';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postTransferLeadershipRoute, { name: 'api.units.transfer-leadership', logSteamId: true });
