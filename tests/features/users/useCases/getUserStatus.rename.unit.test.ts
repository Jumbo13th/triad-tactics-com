import { describe, expect, it, vi } from 'vitest';
import type { SteamAuthDeps } from '@/features/steamAuth/ports';
import { getUserStatus } from "@/features/users/useCases/getUserStatus";

type DeepPartial<T> = {
	[K in keyof T]?: T[K] extends (...args: never[]) => unknown
		? T[K]
		: T[K] extends object
			? DeepPartial<T[K]>
			: T[K];
};

function makeDeps(overrides: DeepPartial<SteamAuthDeps> = {}): SteamAuthDeps {
	const base: SteamAuthDeps = {
		sessions: {
			createSteamSession: vi.fn(),
			getSteamSession: vi.fn(() => null),
			setSteamSessionIdentity: vi.fn(),
			deleteSteamSession: vi.fn()
		},
		applications: {
			getBySteamId64: vi.fn(() => null),
			getByUserId: vi.fn(() => null)
		},
		users: {
			upsertUser: vi.fn(),
			getUserBySteamId64: vi.fn(() => null)
		},
		renameRequests: {
			hasPendingByUserId: vi.fn(() => false),
			getLatestDeclineReasonByUserId: vi.fn(() => null)
		},
		admin: {
			isAdminSteamId: vi.fn(() => false)
		},
		openId: {
			verifyAssertion: vi.fn(async () => false)
		},
		persona: {
			fetchPersonaName: vi.fn(async () => null)
		}
	};

	return {
		...base,
		...overrides,
		sessions: { ...base.sessions, ...((overrides.sessions ?? {}) as SteamAuthDeps['sessions']) },
		applications: { ...base.applications, ...((overrides.applications ?? {}) as SteamAuthDeps['applications']) },
		users: { ...base.users, ...((overrides.users ?? {}) as SteamAuthDeps['users']) },
		renameRequests: { ...base.renameRequests, ...((overrides.renameRequests ?? {}) as SteamAuthDeps['renameRequests']) },
		admin: { ...base.admin, ...((overrides.admin ?? {}) as SteamAuthDeps['admin']) },
		openId: { ...base.openId, ...((overrides.openId ?? {}) as SteamAuthDeps['openId']) },
		persona: { ...base.persona, ...((overrides.persona ?? {}) as SteamAuthDeps['persona']) }
	};
}

describe('users/getUserStatus (unit: rename gating signals)', () => {
	it('returns connected=false when no session identity exists', () => {
		const deps = makeDeps({
			sessions: {
				getSteamSession: vi.fn(() => null)
			}
		});

		const status = getUserStatus(deps, 'missing');
		expect(status.connected).toBe(false);
	});

	it('returns renameRequired + hasPendingRenameRequest based on user + repo state', () => {
		const deps = makeDeps({
			sessions: {
				getSteamSession: vi.fn(() => ({
					id: 'sid',
					created_at: new Date().toISOString(),
					redirect_path: '/en',
					steamid64: '76561198000000999',
					persona_name: 'Persona'
				}))
			},
			users: {
				upsertUser: vi.fn(),
				getUserBySteamId64: vi.fn(() => ({
					id: 123,
					current_callsign: 'Steam_76561198000000999',
					player_confirmed_at: null,
					rename_required_at: new Date().toISOString(),
					rename_required_reason: 'Policy',
					rename_required_by_steamid64: '76561198012345678'
				}))
			},
			renameRequests: {
				hasPendingByUserId: vi.fn(() => true),
				getLatestDeclineReasonByUserId: vi.fn(() => null)
			}
		});

		const status = getUserStatus(deps, 'sid');
		expect(status.connected).toBe(true);
		if (!status.connected) throw new Error('unreachable');
		expect(status.renameRequired).toBe(true);
		expect(status.hasPendingRenameRequest).toBe(true);
		expect(status.renameRequiredReason).toBe('Policy');
		expect(status.renameRequiredBySteamId64).toBe('76561198012345678');
	});

	it('prefers latest declined reason over rename_required_reason', () => {
		const deps = makeDeps({
			sessions: {
				getSteamSession: vi.fn(() => ({
					id: 'sid',
					created_at: new Date().toISOString(),
					redirect_path: '/en',
					steamid64: '76561198000000123',
					persona_name: 'Persona'
				}))
			},
			users: {
				upsertUser: vi.fn(),
				getUserBySteamId64: vi.fn(() => ({
					id: 456,
					current_callsign: 'Steam_76561198000000123',
					player_confirmed_at: null,
					rename_required_at: new Date().toISOString(),
					rename_required_reason: 'Old reason',
					rename_required_by_steamid64: '76561198012345678'
				}))
			},
			renameRequests: {
				hasPendingByUserId: vi.fn(() => false),
				getLatestDeclineReasonByUserId: vi.fn(() => 'Latest declined reason')
			}
		});

		const status = getUserStatus(deps, 'sid');
		expect(status.connected).toBe(true);
		if (!status.connected) throw new Error('unreachable');
		expect(status.renameRequiredReason).toBe('Latest declined reason');
	});
});
