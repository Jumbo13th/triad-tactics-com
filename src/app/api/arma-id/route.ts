import { postSetArmaGuidRoute } from '@/features/armaId/adapters/next/setArmaGuidRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postSetArmaGuidRoute, { name: 'api.arma-id.set', logSteamId: true });
