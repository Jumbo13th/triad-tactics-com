import { postAdminCronRoute } from '@/features/admin/adapters/next/cronRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postAdminCronRoute, {
	name: 'api.admin.cron.post',
	logSteamId: true
});
