import type { UnitDeps } from '../ports';
import { isUnitLeader } from '../domain/rules';

export type DeleteUnitResult =
	| { ok: true; status: 200; json: { success: true } }
	| { ok: false; status: 403; json: { error: 'forbidden' } }
	| { ok: false; status: 404; json: { error: 'not_found' } }
	| { ok: false; status: 500; json: { error: 'server_error' } };

export function deleteUnitAsLeader(deps: UnitDeps, input: {
	unitId: number;
	steamid64: string;
}): DeleteUnitResult {
	const user = deps.users.getUserBySteamId64(input.steamid64);
	if (!user) return { ok: false, status: 403, json: { error: 'forbidden' } };

	const unit = deps.repo.getUnitById(input.unitId);
	if (!unit) return { ok: false, status: 404, json: { error: 'not_found' } };

	if (!isUnitLeader(unit, user.id)) return { ok: false, status: 403, json: { error: 'forbidden' } };

	const result = deps.repo.deleteUnit(input.unitId);
	if (!result.success) {
		if (result.error === 'not_found') return { ok: false, status: 404, json: { error: 'not_found' } };
		return { ok: false, status: 500, json: { error: 'server_error' } };
	}

	return { ok: true, status: 200, json: { success: true } };
}
