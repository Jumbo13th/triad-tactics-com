import type { UnitDeps } from '../ports';
import { createUnitRequestSchema } from '../domain/requests';
import { isConfirmedPlayer } from '../domain/rules';

export type CreateUnitInput = {
	body: unknown;
	steamid64: string;
};

export type CreateUnitResult =
	| { ok: true; status: 201; json: { id: number } }
	| { ok: false; status: 400; json: { error: 'validation_error'; details: unknown } }
	| { ok: false; status: 403; json: { error: 'not_confirmed' } }
	| { ok: false; status: 409; json: { error: 'already_in_unit' | 'tag_taken' | 'name_taken' } }
	| { ok: false; status: 500; json: { error: 'server_error' } };

export function createUnit(deps: UnitDeps, input: CreateUnitInput): CreateUnitResult {
	const user = deps.users.getUserBySteamId64(input.steamid64);
	if (!user) return { ok: false, status: 403, json: { error: 'not_confirmed' } };
	if (!isConfirmedPlayer(user)) return { ok: false, status: 403, json: { error: 'not_confirmed' } };

	const existingUnit = deps.memberships.getActiveMemberUnit(user.id);
	if (existingUnit) return { ok: false, status: 409, json: { error: 'already_in_unit' } };

	const parsed = createUnitRequestSchema.safeParse(input.body);
	if (!parsed.success) return { ok: false, status: 400, json: { error: 'validation_error', details: parsed.error.flatten() } };

	const result = deps.repo.createUnit({
		name: parsed.data.name,
		tag: parsed.data.tag,
		description: parsed.data.description,
		memberNames: parsed.data.memberNames,
		history: parsed.data.history,
		otherProjects: parsed.data.otherProjects,
		creatorUserId: user.id
	});

	if (!result.success) {
		if (result.error === 'tag_taken') return { ok: false, status: 409, json: { error: 'tag_taken' } };
		if (result.error === 'name_taken') return { ok: false, status: 409, json: { error: 'name_taken' } };
		return { ok: false, status: 500, json: { error: 'server_error' } };
	}

	const callsign = deps.users.getCallsign(user.id);
	deps.events.logUnitEvent({ unitId: result.unitId, kind: 'created', actorCallsign: callsign });

	return { ok: true, status: 201, json: { id: result.unitId } };
}
