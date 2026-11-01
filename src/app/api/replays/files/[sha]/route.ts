import { getViewerFileRoute } from '@/features/replays/adapters/next/viewerFileRoute';
import { withApiLogging } from '@/platform/nextRouteLogging';

export const runtime = 'nodejs';

export const GET = withApiLogging(getViewerFileRoute, { name: 'api.replays.files.view' });
