import { postAdminBadgeDiscordRoleRoute } from '@/features/admin/adapters/next/badgesRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postAdminBadgeDiscordRoleRoute, {
	name: 'api.admin.badges.discord-role.post',
	logSteamId: true
});
