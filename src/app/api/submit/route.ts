import { postSubmitApplicationRoute } from '@/features/apply/adapters/next/submitRoute';
import { withApiLogging } from '@/platform/nextRouteLogging';

export const runtime = 'nodejs';

export const POST = withApiLogging(postSubmitApplicationRoute, { name: 'api.submit' });
