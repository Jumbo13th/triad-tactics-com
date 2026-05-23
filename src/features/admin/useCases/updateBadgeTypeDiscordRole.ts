import type { AdminBadgeType } from '@/features/admin/domain/types';
import type { UpdateBadgeTypeDiscordRoleDeps } from '../ports';

export type UpdateBadgeTypeDiscordRoleResult =
	| { ok: true; badge: AdminBadgeType }
	| { ok: false; error: 'not_found' | 'database_error' };

export function updateBadgeTypeDiscordRole(
	deps: UpdateBadgeTypeDiscordRoleDeps,
	input: { badgeTypeId: number; discordRoleId: string | null; updatedBySteamId64: string }
): UpdateBadgeTypeDiscordRoleResult {
	const result = deps.repo.updateBadgeTypeDiscordRoleId(input);
	if (result.success) {
		return { ok: true, badge: result.badge };
	}

	return { ok: false, error: result.error };
}
