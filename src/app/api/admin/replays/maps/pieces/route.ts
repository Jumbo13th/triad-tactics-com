import { putAdminMapPieceRoute } from '@/features/replays/adapters/next/adminMapRoutes';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const PUT = withApiGuards(putAdminMapPieceRoute, { name: 'api.admin.replays.maps.pieces.put', logSteamId: true });
