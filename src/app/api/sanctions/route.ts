import { getPublicSanctionsRoute } from '@/features/sanctions/adapters/next/publicSanctionsHandler';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const GET = withApiGuards(getPublicSanctionsRoute, { name: 'api.sanctions.public' });
