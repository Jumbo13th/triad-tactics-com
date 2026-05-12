import type { GameAdminMission } from '../domain/types';
import type { ReleaseUnitGameplayDeps } from '../ports';

export type ReleaseUnitGameplayResult =
	| { ok: true; mission: GameAdminMission }
	| {
			ok: false;
			error: 'not_found' | 'not_published' | 'final_password_required' | 'already_released' | 'database_error';
	  };

export function releaseUnitGameplay(
	deps: ReleaseUnitGameplayDeps,
	input: { missionId: number; releasedBySteamId64: string }
): ReleaseUnitGameplayResult {
	const result = deps.repo.releaseUnitGameplay(input);
	if (result.success) {
		return { ok: true, mission: result.mission };
	}
	return { ok: false, error: result.error };
}
