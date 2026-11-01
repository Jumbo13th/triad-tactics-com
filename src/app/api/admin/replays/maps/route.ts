import { postAdminMapRoute } from '@/features/replays/adapters/next/adminMapRoutes';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postAdminMapRoute, { name: 'api.admin.replays.maps.post', logSteamId: true });
