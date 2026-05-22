import { postAdminCancelSanctionRoute } from '@/features/sanctions/adapters/next/adminSanctionsHandlers';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postAdminCancelSanctionRoute, { name: 'api.admin.sanctions.cancel', logSteamId: true });
