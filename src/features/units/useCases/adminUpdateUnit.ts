import type { UnitDeps } from '../ports';
import { updateUnitRequestSchema, adminSetSlotsRequestSchema } from '../domain/requests';

export type AdminUpdateUnitResult =
	| { ok: true; status: 200; json: { success: true } }
	| { ok: false; status: 400; json: { error: 'validation_error'; details: unknown } }
	| { ok: false; status: 404; json: { error: 'not_found' } }
	| { ok: false; status: 409; json: { error: 'tag_taken' | 'name_taken' } }
	| { ok: false; status: 500; json: { error: 'server_error' } };

export function adminUpdateUnit(deps: UnitDeps, input: {
	unitId: number;
	body: unknown;
}): AdminUpdateUnitResult {
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

export type AdminSetSlotsResult =
	| { ok: true; status: 200; json: { success: true } }
	| { ok: false; status: 400; json: { error: 'validation_error'; details: unknown } }
	| { ok: false; status: 404; json: { error: 'not_found' } }
	| { ok: false; status: 500; json: { error: 'server_error' } };

export function adminSetSlots(deps: UnitDeps, input: {
	unitId: number;
	body: unknown;
}): AdminSetSlotsResult {
	const parsed = adminSetSlotsRequestSchema.safeParse(input.body);
	if (!parsed.success) return { ok: false, status: 400, json: { error: 'validation_error', details: parsed.error.flatten() } };

	const result = deps.repo.setUnitSlots(input.unitId, parsed.data.slotsAllocated);
	if (!result.success) {
		if (result.error === 'not_found') return { ok: false, status: 404, json: { error: 'not_found' } };
		return { ok: false, status: 500, json: { error: 'server_error' } };
	}
	deps.events.logUnitEvent({ unitId: input.unitId, kind: 'slots_changed', meta: String(parsed.data.slotsAllocated) });
	return { ok: true, status: 200, json: { success: true } };
}
