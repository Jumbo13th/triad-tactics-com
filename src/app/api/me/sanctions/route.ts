import { getUserSanctionsRoute } from '@/features/sanctions/adapters/next/userSanctionsHandler';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const GET = withApiGuards(getUserSanctionsRoute, { name: 'api.me.sanctions' });
