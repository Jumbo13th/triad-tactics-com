import type { UnitDeps } from '../ports';
import { uploadAvatarRequestSchema, validateAvatarSize, validateImageMagicBytes } from '../domain/requests';
import { canEditUnit } from '../domain/rules';

export type UploadAvatarResult =
	| { ok: true; status: 200; json: { success: true } }
	| { ok: false; status: 400; json: { error: 'validation_error' | 'too_large'; details?: unknown } }
	| { ok: false; status: 403; json: { error: 'forbidden' } }
	| { ok: false; status: 404; json: { error: 'not_found' } }
	| { ok: false; status: 500; json: { error: 'server_error' } };

export function uploadAvatar(deps: UnitDeps, input: {
	unitId: number;
	body: unknown;
	steamid64: string;
	isAdmin: boolean;
}): UploadAvatarResult {
	const unit = deps.repo.getUnitById(input.unitId);
	if (!unit) return { ok: false, status: 404, json: { error: 'not_found' } };

	const user = deps.users.getUserBySteamId64(input.steamid64);
	if (!user) return { ok: false, status: 403, json: { error: 'forbidden' } };

	const membership = deps.memberships.getMembershipByUserAndUnit(user.id, input.unitId);
	if (!canEditUnit(input.isAdmin, membership)) {
		return { ok: false, status: 403, json: { error: 'forbidden' } };
	}

	const parsed = uploadAvatarRequestSchema.safeParse(input.body);
	if (!parsed.success) return { ok: false, status: 400, json: { error: 'validation_error', details: parsed.error.flatten() } };

	if (!validateAvatarSize(parsed.data.data)) return { ok: false, status: 400, json: { error: 'too_large' } };
	if (!validateImageMagicBytes(parsed.data.data, parsed.data.mime)) return { ok: false, status: 400, json: { error: 'validation_error' } };

	const result = deps.repo.setUnitAvatar(input.unitId, parsed.data.data, parsed.data.mime);
	if (!result.success) return { ok: false, status: 500, json: { error: 'server_error' } };

	return { ok: true, status: 200, json: { success: true } };
}

export type DeleteAvatarResult =
	| { ok: true; status: 200; json: { success: true } }
	| { ok: false; status: 403; json: { error: 'forbidden' } }
	| { ok: false; status: 404; json: { error: 'not_found' } }
	| { ok: false; status: 500; json: { error: 'server_error' } };

export function deleteAvatar(deps: UnitDeps, input: {
	unitId: number;
	steamid64: string;
	isAdmin: boolean;
}): DeleteAvatarResult {
	const unit = deps.repo.getUnitById(input.unitId);
	if (!unit) return { ok: false, status: 404, json: { error: 'not_found' } };

	const user = deps.users.getUserBySteamId64(input.steamid64);
	if (!user) return { ok: false, status: 403, json: { error: 'forbidden' } };

	const membership = deps.memberships.getMembershipByUserAndUnit(user.id, input.unitId);
	if (!canEditUnit(input.isAdmin, membership)) {
		return { ok: false, status: 403, json: { error: 'forbidden' } };
	}

	const result = deps.repo.deleteUnitAvatar(input.unitId);
	if (!result.success) return { ok: false, status: 500, json: { error: 'server_error' } };

	return { ok: true, status: 200, json: { success: true } };
}
