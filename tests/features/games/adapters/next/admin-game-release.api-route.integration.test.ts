import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../../../fixtures/dbOperations';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';

const ADMIN_STEAM_ID = '76561198012345678';

async function loadAdminGameReleaseHarness() {
	const { dbOperations } = await import('../../../../fixtures/dbOperations');
	const { POST: POST_RELEASE_PRIORITY } = await import('@/app/api/admin/games/[missionId]/release-priority/route');
	const { POST: POST_RELEASE_REGULAR } = await import('@/app/api/admin/games/[missionId]/release-regular/route');
	const { POST: POST_HIDE_PRIORITY } = await import('@/app/api/admin/games/[missionId]/hide-priority/route');
	const { POST: POST_HIDE_REGULAR } = await import('@/app/api/admin/games/[missionId]/hide-regular/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, POST_RELEASE_PRIORITY, POST_RELEASE_REGULAR, POST_HIDE_PRIORITY, POST_HIDE_REGULAR, NextRequest };
}

function missionRouteContext(missionId: number | string) {
	return {
		params: Promise.resolve({ missionId: String(missionId) })
	};
}

function createSlottingShape(opts: { includePriority?: boolean; includeRegular?: boolean }) {
	const slots: Array<Record<string, unknown>> = [
		{
			id: 'slot-squad-lead',
			role: 'Squad Leader',
			access: 'unit',
			occupant: { type: 'placeholder', label: 'Alpha Squad' }
		}
	];

	if (opts.includePriority) {
		slots.push({
			id: 'slot-priority',
			role: 'Machine Gunner',
			access: 'priority',
			occupant: null
		});
	}

	if (opts.includeRegular) {
		slots.push({
			id: 'slot-regular',
			role: 'Rifleman',
			access: 'regular',
			occupant: null
		});
	}

	return {
		sides: [
			{
				id: 'usk',
				name: 'USK',
				color: '#3B82F6',
				squads: [
					{
						id: 'usk-1-1',
						name: '1-1',
						slots
					}
				]
			}
		]
	};
}

function insertPublishedMission(opts?: {
	shortCode?: string;
	priorityClaimManualState?: 'default' | 'open' | 'closed';
	regularJoinEnabled?: boolean;
	priorityGameplayReleasedAt?: string | null;
	regularGameplayReleasedAt?: string | null;
	priorityGameplayEverReleased?: boolean;
	regularGameplayEverReleased?: boolean;
	earlyPassword?: string | null;
	finalPassword?: string | null;
	slotting?: unknown;
}): number {
	const db = getDb();
	const early = opts?.earlyPassword === undefined ? 'mods-pass' : opts.earlyPassword;
	const final = opts?.finalPassword === undefined ? 'live-pass' : opts.finalPassword;
	const result = db.prepare(`
		INSERT INTO missions (
			short_code,
			status,
			title,
			description,
			server_name,
			server_host,
			server_port,
			early_password,
			final_password,
			priority_claim_manual_state,
			regular_join_enabled,
			priority_gameplay_released_at,
			regular_gameplay_released_at,
			priority_gameplay_ever_released,
			regular_gameplay_ever_released,
			slotting_json,
			created_by_steamid64,
			updated_by_steamid64,
			published_at,
			published_by_steamid64
		)
		VALUES (?, 'published', 'Operation Release', '', 'Triad Server', '203.0.113.40', 2302, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
	`).run(
		opts?.shortCode ?? 'OP-RELEASE',
		early,
		final,
		opts?.priorityClaimManualState ?? 'open',
		opts?.regularJoinEnabled ? 1 : 0,
		opts?.priorityGameplayReleasedAt ?? null,
		opts?.regularGameplayReleasedAt ?? null,
		typeof opts?.priorityGameplayEverReleased === 'boolean' ? (opts.priorityGameplayEverReleased ? 1 : 0) : (opts?.priorityGameplayReleasedAt ? 1 : 0),
		typeof opts?.regularGameplayEverReleased === 'boolean' ? (opts.regularGameplayEverReleased ? 1 : 0) : (opts?.regularGameplayReleasedAt ? 1 : 0),
		JSON.stringify(opts?.slotting ?? createSlottingShape({ includePriority: true, includeRegular: true })),
		ADMIN_STEAM_ID,
		ADMIN_STEAM_ID,
		ADMIN_STEAM_ID
	);

	const rowId = result.lastInsertRowid;
	return typeof rowId === 'bigint' ? Number(rowId) : rowId;
}

function insertUser(steamId64: string, callsign: string): number {
	const db = getDb();
	const userInfo = db.prepare('INSERT INTO users (current_callsign) VALUES (?)').run(callsign);
	const userIdRaw = userInfo.lastInsertRowid;
	const userId = typeof userIdRaw === 'bigint' ? Number(userIdRaw) : userIdRaw;
		db.prepare(
			`INSERT INTO user_identities (user_id, provider, provider_user_id) VALUES (?, 'steam', ?)`
		).run(userId, steamId64);
	return userId;
}

function insertRegularJoin(missionId: number, userId: number, steamId64: string) {
	getDb().prepare(`
		INSERT INTO mission_regular_joins (mission_id, user_id, joined_by_steamid64)
		VALUES (?, ?, ?)
	`).run(missionId, userId, steamId64);
}

describe('Admin game release endpoints (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({
			prefix: 'triad-tactics-admin-game-release-test',
			adminSteamIds: ADMIN_STEAM_ID
		});
	});

	beforeEach(async () => {
		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		dbOperations.clearAll();
	});

	it('releases priority gameplay and closes claim plus regular join', async () => {
		const { dbOperations, POST_RELEASE_PRIORITY, NextRequest } = await loadAdminGameReleaseHarness();
		const missionId = insertPublishedMission({ shortCode: 'OP-PRIORITY-REL', regularJoinEnabled: true });
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const res = await POST_RELEASE_PRIORITY(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/release-priority`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					cookie: `tt_steam_session=${adminSid}`
				}
			}),
			missionRouteContext(missionId)
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.mission.priorityClaimManualState).toBe('closed');
		expect(json.mission.priorityGameplayReleasedAt).toMatch(/^\d{4}-\d{2}-\d{2} /);

		const row = getDb()
			.prepare(
				'SELECT priority_claim_manual_state, regular_join_enabled, priority_gameplay_released_at FROM missions WHERE id = ? LIMIT 1'
			)
			.get(missionId) as {
				priority_claim_manual_state: string;
				regular_join_enabled: number;
				priority_gameplay_released_at: string | null;
			};
		expect(row.priority_claim_manual_state).toBe('closed');
		expect(row.priority_gameplay_released_at).not.toBeNull();
	});

	it('blocks priority gameplay release when no final password exists', async () => {
		const { dbOperations, POST_RELEASE_PRIORITY, NextRequest } = await loadAdminGameReleaseHarness();
		const missionId = insertPublishedMission({ shortCode: 'OP-PRIORITY-NO-FINAL', finalPassword: null });
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const res = await POST_RELEASE_PRIORITY(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/release-priority`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					cookie: `tt_steam_session=${adminSid}`
				}
			}),
			missionRouteContext(missionId)
		);

		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({ error: 'final_password_required' });
	});

	it('releases regular gameplay and snapshots current regular joiners', async () => {
		const { dbOperations, POST_RELEASE_REGULAR, NextRequest } = await loadAdminGameReleaseHarness();
		const missionId = insertPublishedMission({
			shortCode: 'OP-REGULAR-REL',
			priorityGameplayReleasedAt: '2026-03-20T19:10:00.000Z',
			regularJoinEnabled: false
		});
		const userA = insertUser('76561198000000200', 'Walker');
		const userB = insertUser('76561198000000201', 'Rook');
		insertRegularJoin(missionId, userA, '76561198000000200');
		insertRegularJoin(missionId, userB, '76561198000000201');
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const res = await POST_RELEASE_REGULAR(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/release-regular`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					cookie: `tt_steam_session=${adminSid}`
				}
			}),
			missionRouteContext(missionId)
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.mission.regularGameplayReleasedAt).toMatch(/^\d{4}-\d{2}-\d{2} /);

		const snapshotRows = getDb()
			.prepare(
				'SELECT user_id FROM mission_regular_release_snapshot WHERE mission_id = ? ORDER BY user_id ASC'
			)
			.all(missionId) as Array<{ user_id: number }>;
		expect(snapshotRows).toEqual([{ user_id: userA }, { user_id: userB }]);
	});

	it('blocks regular gameplay release until priority gameplay has been released', async () => {
		const { dbOperations, POST_RELEASE_REGULAR, NextRequest } = await loadAdminGameReleaseHarness();
		const missionId = insertPublishedMission({ shortCode: 'OP-REGULAR-BLOCKED' });
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const res = await POST_RELEASE_REGULAR(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/release-regular`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					cookie: `tt_steam_session=${adminSid}`
				}
			}),
			missionRouteContext(missionId)
		);

		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({ error: 'priority_release_required' });
	});

	it('hides regular gameplay password after release', async () => {
		const { dbOperations, POST_HIDE_REGULAR, NextRequest } = await loadAdminGameReleaseHarness();
		const missionId = insertPublishedMission({
			shortCode: 'OP-HIDE-REGULAR',
			priorityGameplayReleasedAt: '2026-03-20T19:10:00.000Z',
			regularGameplayReleasedAt: '2026-03-20T19:20:00.000Z'
		});
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const res = await POST_HIDE_REGULAR(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/hide-regular`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					cookie: `tt_steam_session=${adminSid}`
				}
			}),
			missionRouteContext(missionId)
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.mission.regularGameplayReleasedAt).toBeNull();

		const row = getDb()
			.prepare('SELECT regular_gameplay_released_at, regular_gameplay_ever_released FROM missions WHERE id = ? LIMIT 1')
			.get(missionId) as { regular_gameplay_released_at: string | null; regular_gameplay_ever_released: number };
		expect(row.regular_gameplay_released_at).toBeNull();
		expect(row.regular_gameplay_ever_released).toBe(1);
	});

	it('requires hiding regular password before hiding priority password', async () => {
		const { dbOperations, POST_HIDE_PRIORITY, NextRequest } = await loadAdminGameReleaseHarness();
		const missionId = insertPublishedMission({
			shortCode: 'OP-HIDE-PRIORITY-BLOCKED',
			priorityGameplayReleasedAt: '2026-03-20T19:10:00.000Z',
			regularGameplayReleasedAt: '2026-03-20T19:20:00.000Z'
		});
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const res = await POST_HIDE_PRIORITY(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/hide-priority`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					cookie: `tt_steam_session=${adminSid}`
				}
			}),
			missionRouteContext(missionId)
		);

		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({ error: 'regular_release_hide_required' });
	});

	it('hides priority password when regular release is already hidden', async () => {
		const { dbOperations, POST_HIDE_PRIORITY, NextRequest } = await loadAdminGameReleaseHarness();
		const missionId = insertPublishedMission({
			shortCode: 'OP-HIDE-PRIORITY',
			priorityGameplayReleasedAt: '2026-03-20T19:10:00.000Z',
			regularGameplayReleasedAt: null
		});
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const res = await POST_HIDE_PRIORITY(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/hide-priority`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					cookie: `tt_steam_session=${adminSid}`
				}
			}),
			missionRouteContext(missionId)
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.mission.priorityGameplayReleasedAt).toBeNull();

		const row = getDb()
			.prepare('SELECT priority_gameplay_released_at, priority_gameplay_ever_released FROM missions WHERE id = ? LIMIT 1')
			.get(missionId) as { priority_gameplay_released_at: string | null; priority_gameplay_ever_released: number };
		expect(row.priority_gameplay_released_at).toBeNull();
		expect(row.priority_gameplay_ever_released).toBe(1);
	});
});
