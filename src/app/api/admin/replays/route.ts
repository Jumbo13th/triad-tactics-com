import { getAdminReplaysRoute, postAdminReplaysRoute } from '@/features/replays/adapters/next/adminReplaysRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const GET = withApiGuards(getAdminReplaysRoute, { name: 'api.admin.replays.get', logSteamId: true });
export const POST = withApiGuards(postAdminReplaysRoute, { name: 'api.admin.replays.post', logSteamId: true });
