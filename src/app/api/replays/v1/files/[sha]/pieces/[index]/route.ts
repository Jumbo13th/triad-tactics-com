import { putReplayPieceRoute } from '@/features/replays/adapters/next/receiverRoutes';
import { withApiLogging } from '@/platform/nextRouteLogging';

export const runtime = 'nodejs';

export const PUT = withApiLogging(putReplayPieceRoute, { name: 'api.replays.pieces.put' });
