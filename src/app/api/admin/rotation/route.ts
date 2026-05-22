import { getAdminRotationRoute, putAdminRotationRoute } from '@/features/rotation/adapters/next/adminRotationRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const GET = withApiGuards(getAdminRotationRoute, { name: 'api.admin.rotation.get', logSteamId: true });
export const PUT = withApiGuards(putAdminRotationRoute, { name: 'api.admin.rotation.update', logSteamId: true });
