import type { UnitDeps } from '../ports';
import { updateUnitRequestSchema } from '../domain/requests';
import { canEditUnit } from '../domain/rules';

export type UpdateUnitResult =
	| { ok: true; status: 200; json: { success: true } }
	| { ok: false; status: 400; json: { error: 'validation_error'; details: unknown } }
	| { ok: false; status: 403; json: { error: 'forbidden' } }
	| { ok: false; status: 404; json: { error: 'not_found' } }
	| { ok: false; status: 409; json: { error: 'tag_taken' | 'name_taken' } }
	| { ok: false; status: 500; json: { error: 'server_error' } };

export function updateUnit(deps: UnitDeps, input: {
	unitId: number;
	body: unknown;
	steamid64: string;
	isAdmin: boolean;
}): UpdateUnitResult {
	const unit = deps.repo.getUnitById(input.unitId);
	if (!unit) return { ok: false, status: 404, json: { error: 'not_found' } };

	const user = deps.users.getUserBySteamId64(input.steamid64);
	if (!user || !canEditUnit(unit, user.id, input.isAdmin)) {
		return { ok: false, status: 403, json: { error: 'forbidden' } };
	}

	const parsed = updateUnitRequestSchema.safeParse(input.body);
	if (!parsed.success) return { ok: false, status: 400, json: { error: 'validation_error', details: parsed.error.flatten() } };

	const result = deps.repo.updateUnit(input.unitId, parsed.data);
	if (!result.success) {
		if (result.error === 'not_found') return { ok: false, status: 404, json: { error: 'not_found' } };
		if (result.error === 'tag_taken') return { ok: false, status: 409, json: { error: 'tag_taken' } };
		if (result.error === 'name_taken') return { ok: false, status: 409, json: { error: 'name_taken' } };
		return { ok: false, status: 500, json: { error: 'server_error' } };
	}

	return { ok: true, status: 200, json: { success: true } };
}
