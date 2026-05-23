import {
	getAdminGameImageRoute,
	postAdminGameImageRoute,
	deleteAdminGameImageRoute
} from '@/features/games/adapters/next/adminGameMissionRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const GET = withApiGuards(getAdminGameImageRoute, {
	name: 'api.admin.games.image.get',
	logSteamId: false
});

export const POST = withApiGuards(postAdminGameImageRoute, {
	name: 'api.admin.games.image.post',
	logSteamId: true
});

export const DELETE = withApiGuards(deleteAdminGameImageRoute, {
	name: 'api.admin.games.image.delete',
	logSteamId: true
});
