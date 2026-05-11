import type { GameAdminMission } from '../domain/types';
import type { HideUnitGameplayDeps } from '../ports';

export type HideUnitGameplayResult =
	| { ok: true; mission: GameAdminMission }
	| {
			ok: false;
			error: 'not_found' | 'not_published' | 'priority_release_hide_required' | 'already_hidden' | 'database_error';
	  };

export function hideUnitGameplay(
	deps: HideUnitGameplayDeps,
	input: { missionId: number; hiddenBySteamId64: string }
): HideUnitGameplayResult {
	const result = deps.repo.hideUnitGameplay(input);
	if (result.success) {
		return { ok: true, mission: result.mission };
	}
	return { ok: false, error: result.error };
}
