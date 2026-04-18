import { postApplyToUnitRoute } from '@/features/units/adapters/next/unitRoutes';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postApplyToUnitRoute, { name: 'api.units.apply', logSteamId: true });
