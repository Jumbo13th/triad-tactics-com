import { postReplayGameRoute } from '@/features/replays/adapters/next/receiverRoutes';
import { withApiLogging } from '@/platform/nextRouteLogging';

export const runtime = 'nodejs';

export const POST = withApiLogging(postReplayGameRoute, { name: 'api.replays.games.post' });
