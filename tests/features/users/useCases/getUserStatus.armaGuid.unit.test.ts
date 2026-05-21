import { describe, expect, it, vi } from 'vitest';
import type { SteamAuthDeps } from '@/features/steamAuth/ports';
import { getUserStatus } from '@/features/users/useCases/getUserStatus';

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

function makeSession(steamid64: string) {
	return {
		id: 'sid',
		created_at: new Date().toISOString(),
		redirect_path: '/en',
		steamid64,
		persona_name: 'Persona'
	};
}

describe('users/getUserStatus (unit: arma guid fields)', () => {
	it('sets armaGuidRequired=true when confirmed user has no arma_guid', () => {
		const deps = makeDeps({
			sessions: {
				getSteamSession: vi.fn(() => makeSession('76561198000000001'))
			},
			users: {
				upsertUser: vi.fn(),
				getUserBySteamId64: vi.fn(() => ({
					id: 1,
					current_callsign: 'TestUser',
					player_confirmed_at: '2024-01-01T00:00:00Z',
					arma_guid: null
				}))
			},
			applications: {
				getByUserId: vi.fn(() => ({
					id: 1,
					email: 'test@example.com',
					steamid64: '76561198000000001',
					persona_name: 'Persona',
					answers: {},
					ip_address: '127.0.0.1',
					locale: 'en',
					created_at: '2024-01-01T00:00:00Z'
				}))
			}
		});

		const status = getUserStatus(deps, 'sid');
		expect(status.connected).toBe(true);
		if (!status.connected) throw new Error('unreachable');
		expect(status.armaGuid).toBeNull();
		expect(status.armaGuidRequired).toBe(true);
	});

	it('sets armaGuidRequired=false when confirmed user has arma_guid', () => {
		const deps = makeDeps({
			sessions: {
				getSteamSession: vi.fn(() => makeSession('76561198000000002'))
			},
			users: {
				upsertUser: vi.fn(),
				getUserBySteamId64: vi.fn(() => ({
					id: 2,
					current_callsign: 'TestUser2',
					player_confirmed_at: '2024-01-01T00:00:00Z',
					arma_guid: 'a1b2c3d4-5678-9abc-def0-1234567890ab'
				}))
			},
			applications: {
				getByUserId: vi.fn(() => ({
					id: 2,
					email: 'test2@example.com',
					steamid64: '76561198000000002',
					persona_name: 'Persona2',
					answers: {},
					ip_address: '127.0.0.1',
					locale: 'en',
					created_at: '2024-01-01T00:00:00Z'
				}))
			}
		});

		const status = getUserStatus(deps, 'sid');
		expect(status.connected).toBe(true);
		if (!status.connected) throw new Error('unreachable');
		expect(status.armaGuid).toBe('a1b2c3d4-5678-9abc-def0-1234567890ab');
		expect(status.armaGuidRequired).toBe(false);
	});

	it('sets armaGuidRequired=false when user is not confirmed', () => {
		const deps = makeDeps({
			sessions: {
				getSteamSession: vi.fn(() => makeSession('76561198000000003'))
			},
			users: {
				upsertUser: vi.fn(),
				getUserBySteamId64: vi.fn(() => ({
					id: 3,
					current_callsign: 'TestUser3',
					player_confirmed_at: null,
					arma_guid: null
				}))
			}
		});

		const status = getUserStatus(deps, 'sid');
		expect(status.connected).toBe(true);
		if (!status.connected) throw new Error('unreachable');
		expect(status.armaGuidRequired).toBe(false);
	});
});
