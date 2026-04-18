import { postLeaveUnitRoute } from '@/features/units/adapters/next/unitRoutes';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postLeaveUnitRoute, { name: 'api.units.leave', logSteamId: true });
