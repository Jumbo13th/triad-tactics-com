import { getAdminSanctionsRoute, postAdminCreateSanctionRoute } from '@/features/sanctions/adapters/next/adminSanctionsHandlers';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const GET = withApiGuards(getAdminSanctionsRoute, { name: 'api.admin.sanctions.list', logSteamId: true });
export const POST = withApiGuards(postAdminCreateSanctionRoute, { name: 'api.admin.sanctions.create', logSteamId: true });
