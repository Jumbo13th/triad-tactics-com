import { commitReplayFileRoute, getReplayFileRoute } from '@/features/replays/adapters/next/receiverRoutes';
import { withApiLogging } from '@/platform/nextRouteLogging';

export const runtime = 'nodejs';

export const GET = withApiLogging(getReplayFileRoute, { name: 'api.replays.files.get' });
export const POST = withApiLogging(commitReplayFileRoute, { name: 'api.replays.files.commit' });
