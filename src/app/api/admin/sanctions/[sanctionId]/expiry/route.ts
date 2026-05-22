import { postAdminUpdateSanctionExpiryRoute } from '@/features/sanctions/adapters/next/adminSanctionsHandlers';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postAdminUpdateSanctionExpiryRoute, { name: 'api.admin.sanctions.expiry', logSteamId: true });
