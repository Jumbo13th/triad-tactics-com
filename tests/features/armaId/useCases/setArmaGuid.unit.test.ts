import { describe, expect, it } from 'vitest';
import { setArmaGuid } from '@/features/armaId/useCases/setArmaGuid';
import type { SetArmaGuidDeps } from '@/features/armaId/ports';

function makeDeps(overrides?: Partial<SetArmaGuidDeps['users']>): SetArmaGuidDeps {
	const base: SetArmaGuidDeps['users'] = {
		getOrCreateUserBySteamId64: () => ({ success: true, user: { id: 1, arma_guid: null } }),
		setArmaGuidByUserId: () => ({ success: true }),
		isArmaGuidTaken: () => false
	};
	return { users: { ...base, ...overrides } };
}

const VALID_GUID = 'a1b2c3d4-5678-9abc-def0-1234567890ab';

describe('setArmaGuid (use case)', () => {
	it('saves arma guid for a valid user', () => {
		const result = setArmaGuid(makeDeps(), {
			steamid64: '76561198000000001',
			armaGuid: VALID_GUID
		});
		expect(result).toEqual({ ok: true });
	});

	it('returns database_error when user lookup fails', () => {
		const result = setArmaGuid(
			makeDeps({
				getOrCreateUserBySteamId64: () => ({ success: false, error: 'database_error' })
			}),
			{ steamid64: '76561198000000001', armaGuid: VALID_GUID }
		);
		expect(result).toEqual({ ok: false, error: 'database_error' });
	});

	it('returns duplicate when guid is already taken', () => {
		const result = setArmaGuid(
			makeDeps({
				isArmaGuidTaken: () => true
			}),
			{ steamid64: '76561198000000001', armaGuid: VALID_GUID }
		);
		expect(result).toEqual({ ok: false, error: 'duplicate' });
	});

	it('passes excludeUserId to isArmaGuidTaken', () => {
		let capturedExclude: number | undefined;
		setArmaGuid(
			makeDeps({
				getOrCreateUserBySteamId64: () => ({ success: true, user: { id: 42, arma_guid: null } }),
				isArmaGuidTaken: (_guid, excludeUserId) => {
					capturedExclude = excludeUserId;
					return false;
				}
			}),
			{ steamid64: '76561198000000001', armaGuid: VALID_GUID }
		);
		expect(capturedExclude).toBe(42);
	});

	it('returns not_found when setArmaGuidByUserId reports not_found', () => {
		const result = setArmaGuid(
			makeDeps({
				setArmaGuidByUserId: () => ({ success: false, error: 'not_found' })
			}),
			{ steamid64: '76561198000000001', armaGuid: VALID_GUID }
		);
		expect(result).toEqual({ ok: false, error: 'not_found' });
	});

	it('returns duplicate when setArmaGuidByUserId reports duplicate (race condition)', () => {
		const result = setArmaGuid(
			makeDeps({
				setArmaGuidByUserId: () => ({ success: false, error: 'duplicate' })
			}),
			{ steamid64: '76561198000000001', armaGuid: VALID_GUID }
		);
		expect(result).toEqual({ ok: false, error: 'duplicate' });
	});
});
