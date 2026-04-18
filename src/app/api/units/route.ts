import { getListUnitsRoute, postCreateUnitRoute } from '@/features/units/adapters/next/unitRoutes';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const GET = withApiGuards(getListUnitsRoute, { name: 'api.units.list', logSteamId: false });
export const POST = withApiGuards(postCreateUnitRoute, { name: 'api.units.create', logSteamId: true });
