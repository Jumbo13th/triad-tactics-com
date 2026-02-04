import { getAdminConfigRoute } from '@/features/admin/adapters/next/configRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const GET = withApiGuards(getAdminConfigRoute, { name: 'api.admin.config', logSteamId: true });
