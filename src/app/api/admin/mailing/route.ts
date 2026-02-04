import { withApiGuards } from '@/platform/apiGates';
import { postApprovedBroadcastRoute } from '@/features/admin/adapters/next/mailingRoute';

export const runtime = 'nodejs';

export const POST = withApiGuards(postApprovedBroadcastRoute, {
	name: 'api.admin.mailing.send',
	logSteamId: true
});
