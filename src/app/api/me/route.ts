import { getUserMeRoute } from '@/features/users/adapters/next/meRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const GET = withApiGuards(getUserMeRoute, { name: 'api.me' });
