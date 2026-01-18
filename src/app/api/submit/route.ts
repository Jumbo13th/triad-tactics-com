import { postSubmitApplicationRoute } from '@/features/apply/adapters/next/submitRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postSubmitApplicationRoute, { name: 'api.submit', logSteamId: true });
