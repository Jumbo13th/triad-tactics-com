import { postConfirmApplicationRoute } from '@/features/admin/adapters/next/confirmApplicationRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postConfirmApplicationRoute, { name: 'api.admin.confirmApplication', logSteamId: true });
