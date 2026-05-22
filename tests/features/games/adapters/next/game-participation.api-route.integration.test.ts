import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApplicationRecord } from '../../../../fixtures/application';
import { getDb } from '../../../../fixtures/dbOperations';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';

const ADMIN_STEAM_ID = '76561198012345678';

async function loadGameParticipationHarness() {
	const { dbOperations } = await import('../../../../fixtures/dbOperations');
	const { POST: POST_CLAIM } = await import('@/app/api/games/[shortCode]/claim/route');
	const { POST: POST_JOIN } = await import('@/app/api/games/[shortCode]/join/route');
	const { POST: POST_LEAVE } = await import('@/app/api/games/[shortCode]/leave/route');
	const { POST: POST_LEAVE_SLOT } = await import('@/app/api/games/[shortCode]/leave-slot/route');
	const { POST: POST_SWITCH } = await import('@/app/api/games/[shortCode]/switch-slot/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, POST_CLAIM, POST_JOIN, POST_LEAVE, POST_LEAVE_SLOT, POST_SWITCH, NextRequest };
}

function gameRouteContext(shortCode: string) {
	return {
		params: Promise.resolve({ shortCode })
	};
}

function createMissionSlotting(opts: { priorityOccupantUserId?: number | null }) {
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
						slots: [
							{
								id: 'slot-squad',
								role: 'Squad Leader',
								access: 'unit',
								occupant: { type: 'placeholder', label: 'Alpha Squad' }
							},
							{
								id: 'slot-priority',
								role: 'Machine Gunner',
								access: 'priority',
								occupant:
									typeof opts.priorityOccupantUserId === 'number'
										? {
											type: 'user',
											userId: opts.priorityOccupantUserId,
											callsign: 'Occupied',
											assignedBy: 'self',
											assignedAt: '2026-03-10T10:00:00.000Z'
										}
										: null
							},
							{
								id: 'slot-regular',
								role: 'Rifleman',
								access: 'regular',
								occupant: null
							}
						]
					}
				]
			}
		]
	};
}

function createSwitchableMissionSlotting(opts: {
	currentUserId?: number | null;
	targetOccupantUserId?: number | null;
}) {
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
						slots: [
							{
								id: 'slot-priority-a',
								role: 'Machine Gunner',
								access: 'priority',
								occupant:
									typeof opts.currentUserId === 'number'
										? {
											type: 'user',
											userId: opts.currentUserId,
											callsign: 'Current',
											assignedBy: 'self',
											assignedAt: '2026-03-10T10:00:00.000Z'
										}
										: null
							},
							{
								id: 'slot-priority-b',
								role: 'Anti-Tank',
								access: 'priority',
								occupant:
									typeof opts.targetOccupantUserId === 'number'
										? {
											type: 'user',
											userId: opts.targetOccupantUserId,
											callsign: 'Taken',
											assignedBy: 'self',
											assignedAt: '2026-03-10T10:05:00.000Z'
										}
										: null
							},
							{
								id: 'slot-regular',
								role: 'Rifleman',
								access: 'regular',
								occupant: null
							}
						]
					}
				]
			}
		]
	};
}

function insertPublishedMission(opts?: {
	shortCode?: string;
	slotting?: unknown;
	regularJoinEnabled?: boolean;
	priorityClaimManualState?: 'default' | 'open' | 'closed';
}): number {
	const db = getDb();
	const result = db.prepare(`
		INSERT INTO missions (
			short_code,
			status,
			title,
			description,
			priority_claim_manual_state,
			regular_join_enabled,
			slotting_json,
			created_by_steamid64,
			updated_by_steamid64,
			published_at,
			published_by_steamid64
		)
		VALUES (?, 'published', 'Operation', '', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
	`).run(
		opts?.shortCode ?? 'OP-1',
		opts?.priorityClaimManualState ?? 'open',
		opts?.regularJoinEnabled ? 1 : 0,
		JSON.stringify(opts?.slotting ?? createMissionSlotting({ priorityOccupantUserId: null })),
		ADMIN_STEAM_ID,
		ADMIN_STEAM_ID,
		ADMIN_STEAM_ID
	);

	const rowId = result.lastInsertRowid;
	return typeof rowId === 'bigint' ? Number(rowId) : rowId;
}

function insertBadgeType(label: string): number {
	const db = getDb();
	const result = db.prepare(`
		INSERT INTO badge_types (label, created_by_steamid64, updated_by_steamid64)
		VALUES (?, ?, ?)
	`).run(label, ADMIN_STEAM_ID, ADMIN_STEAM_ID);

	const rowId = result.lastInsertRowid;
	return typeof rowId === 'bigint' ? Number(rowId) : rowId;
}

function assignMissionBadge(missionId: number, badgeTypeId: number) {
	getDb().prepare(`
		INSERT INTO mission_priority_badges (mission_id, badge_type_id)
		VALUES (?, ?)
	`).run(missionId, badgeTypeId);
}

function assignUserBadge(userId: number, badgeTypeId: number) {
	getDb().prepare(`
		INSERT INTO user_badges (user_id, badge_type_id, assigned_by_steamid64)
		VALUES (?, ?, ?)
	`).run(userId, badgeTypeId, ADMIN_STEAM_ID);
}

function insertRegularJoin(missionId: number, userId: number, steamId64: string) {
	getDb().prepare(`
		INSERT INTO mission_regular_joins (mission_id, user_id, joined_by_steamid64)
		VALUES (?, ?, ?)
	`).run(missionId, userId, steamId64);
}

function createConfirmedPlayer(
	dbOperations: Awaited<ReturnType<typeof loadGameParticipationHarness>>['dbOperations'],
	input: { steamId64: string; callsign: string }
) {
	const inserted = dbOperations.insertApplication(
		buildTestApplicationRecord({
			email: `${input.callsign}-${crypto.randomUUID()}@example.com`,
			steamid64: input.steamId64,
			callsign: input.callsign
		})
	);
	expect(inserted.success).toBe(true);
	if (!inserted.success) {
		throw new Error('Expected application insert to succeed');
	}

	const applicationId = Number(inserted.id);
	const confirmed = dbOperations.confirmApplication(applicationId, ADMIN_STEAM_ID);
	expect(confirmed.success).toBe(true);

	const user = dbOperations.getUserBySteamId64(input.steamId64);
	expect(user?.id).toBeTruthy();
	if (!user?.id) {
		throw new Error('Expected confirmed user to exist');
	}

	dbOperations.setArmaGuidByUserId({ userId: user.id, armaGuid: `test-guid-${input.steamId64}` });

	const sessionId = createSteamSession(dbOperations, {
		steamid64: input.steamId64,
		redirectPath: '/en/games'
	});

	return { sessionId, userId: user.id };
}

describe('Game participation endpoints (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({
			prefix: 'triad-tactics-game-participation-test',
			adminSteamIds: ADMIN_STEAM_ID
		});
	});

	beforeEach(async () => {
		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		dbOperations.clearAll();
	});

	it('lets an eligible confirmed player claim a priority slot and removes any regular join', async () => {
		const { dbOperations, POST_CLAIM, NextRequest } = await loadGameParticipationHarness();
		const missionId = insertPublishedMission({ shortCode: 'OP-CLAIM', regularJoinEnabled: true });
		const badgeId = insertBadgeType('Recon');
		assignMissionBadge(missionId, badgeId);
		const player = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000030',
			callsign: 'Nomad'
		});
		assignUserBadge(player.userId, badgeId);
		insertRegularJoin(missionId, player.userId, '76561198000000030');

		const res = await POST_CLAIM(
			new NextRequest('http://localhost/api/games/OP-CLAIM/claim', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					cookie: `tt_steam_session=${player.sessionId}`
				},
				body: JSON.stringify({ slotId: 'slot-priority' })
			}),
			gameRouteContext('OP-CLAIM')
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);

		const row = getDb()
			.prepare('SELECT slotting_json FROM missions WHERE id = ? LIMIT 1')
			.get(missionId) as { slotting_json: string };
		const saved = JSON.parse(row.slotting_json) as { sides: Array<{ squads: Array<{ slots: Array<{ id: string; occupant: unknown }> }> }> };
		const claimed = saved.sides[0].squads[0].slots.find((slot) => slot.id === 'slot-priority');
		expect(claimed?.occupant).toEqual(
			expect.objectContaining({ type: 'user', userId: player.userId, callsign: 'Nomad' })
		);

		const joinRow = getDb()
			.prepare('SELECT 1 FROM mission_regular_joins WHERE mission_id = ? AND user_id = ? LIMIT 1')
			.get(missionId, player.userId);
		expect(joinRow).toBeUndefined();
	});

	it('returns a conflict when the target slot is already taken', async () => {
		const { dbOperations, POST_CLAIM, NextRequest } = await loadGameParticipationHarness();
		const missionId = insertPublishedMission({
			shortCode: 'OP-TAKEN',
			slotting: createMissionSlotting({ priorityOccupantUserId: 999 })
		});
		const badgeId = insertBadgeType('Marksman');
		assignMissionBadge(missionId, badgeId);
		const player = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000031',
			callsign: 'Rook'
		});
		assignUserBadge(player.userId, badgeId);

		const res = await POST_CLAIM(
			new NextRequest('http://localhost/api/games/OP-TAKEN/claim', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					cookie: `tt_steam_session=${player.sessionId}`
				},
				body: JSON.stringify({ slotId: 'slot-priority' })
			}),
			gameRouteContext('OP-TAKEN')
		);

		expect(res.status).toBe(409);
		const json = await res.json();
		expect(json.error).toBe('slot_taken');
	});

	it('allows badge holders to join regular list even while a priority slot is still available', async () => {
		const { dbOperations, POST_JOIN, NextRequest } = await loadGameParticipationHarness();
		const missionId = insertPublishedMission({ shortCode: 'OP-FALLBACK', regularJoinEnabled: true });
		const badgeId = insertBadgeType('Medic');
		assignMissionBadge(missionId, badgeId);
		const player = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000032',
			callsign: 'MedicOne'
		});
		assignUserBadge(player.userId, badgeId);

		const res = await POST_JOIN(
			new NextRequest('http://localhost/api/games/OP-FALLBACK/join', {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			gameRouteContext('OP-FALLBACK')
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json).toEqual({ success: true, joined: true });

		const joinRow = getDb()
			.prepare('SELECT 1 FROM mission_regular_joins WHERE mission_id = ? AND user_id = ? LIMIT 1')
			.get(missionId, player.userId);
		expect(joinRow).toBeTruthy();
	});

	it('lets a confirmed regular player join and leave the mission', async () => {
		const { dbOperations, POST_JOIN, POST_LEAVE, NextRequest } = await loadGameParticipationHarness();
		const missionId = insertPublishedMission({ shortCode: 'OP-JOIN', regularJoinEnabled: true });
		const player = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000033',
			callsign: 'Walker'
		});

		const joinRes = await POST_JOIN(
			new NextRequest('http://localhost/api/games/OP-JOIN/join', {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			gameRouteContext('OP-JOIN')
		);

		expect(joinRes.status).toBe(200);
		const joinJson = await joinRes.json();
		expect(joinJson).toEqual({ success: true, joined: true });

		const joinRow = getDb()
			.prepare('SELECT 1 FROM mission_regular_joins WHERE mission_id = ? AND user_id = ? LIMIT 1')
			.get(missionId, player.userId);
		expect(joinRow).toBeTruthy();

		const leaveRes = await POST_LEAVE(
			new NextRequest('http://localhost/api/games/OP-JOIN/leave', {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			gameRouteContext('OP-JOIN')
		);

		expect(leaveRes.status).toBe(200);
		const leaveJson = await leaveRes.json();
		expect(leaveJson).toEqual({ success: true, left: true });

		const removedRow = getDb()
			.prepare('SELECT 1 FROM mission_regular_joins WHERE mission_id = ? AND user_id = ? LIMIT 1')
			.get(missionId, player.userId);
		expect(removedRow).toBeUndefined();
	});

	it('lets a player switch from one claimed priority slot to another free priority slot', async () => {
		const { dbOperations, POST_SWITCH, NextRequest } = await loadGameParticipationHarness();
		const player = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000035',
			callsign: 'Shifter'
		});
		const missionId = insertPublishedMission({
			shortCode: 'OP-SWITCH',
			regularJoinEnabled: true,
			slotting: createSwitchableMissionSlotting({ currentUserId: player.userId })
		});
		insertRegularJoin(missionId, player.userId, '76561198000000035');

		const res = await POST_SWITCH(
			new NextRequest('http://localhost/api/games/OP-SWITCH/switch-slot', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					cookie: `tt_steam_session=${player.sessionId}`
				},
				body: JSON.stringify({ slotId: 'slot-priority-b' })
			}),
			gameRouteContext('OP-SWITCH')
		);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true });

		const row = getDb()
			.prepare('SELECT slotting_json FROM missions WHERE id = ? LIMIT 1')
			.get(missionId) as { slotting_json: string };
		const saved = JSON.parse(row.slotting_json) as {
			sides: Array<{ squads: Array<{ slots: Array<{ id: string; occupant: unknown }> }> }>;
		};
		const slots = saved.sides[0].squads[0].slots;
		expect(slots.find((slot) => slot.id === 'slot-priority-a')?.occupant).toBeNull();
		expect(slots.find((slot) => slot.id === 'slot-priority-b')?.occupant).toEqual(
			expect.objectContaining({ type: 'user', userId: player.userId, callsign: 'Shifter' })
		);

		const joinRow = getDb()
			.prepare('SELECT 1 FROM mission_regular_joins WHERE mission_id = ? AND user_id = ? LIMIT 1')
			.get(missionId, player.userId);
		expect(joinRow).toBeUndefined();
	});

	it('returns conflict when switching into an occupied priority slot', async () => {
		const { dbOperations, POST_SWITCH, NextRequest } = await loadGameParticipationHarness();
		const player = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000036',
			callsign: 'Mover'
		});
		const blocker = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000037',
			callsign: 'Blocker'
		});
		insertPublishedMission({
			shortCode: 'OP-SWITCH-TAKEN',
			slotting: createSwitchableMissionSlotting({
				currentUserId: player.userId,
				targetOccupantUserId: blocker.userId
			})
		});

		const res = await POST_SWITCH(
			new NextRequest('http://localhost/api/games/OP-SWITCH-TAKEN/switch-slot', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					cookie: `tt_steam_session=${player.sessionId}`
				},
				body: JSON.stringify({ slotId: 'slot-priority-b' })
			}),
			gameRouteContext('OP-SWITCH-TAKEN')
		);

		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({ error: 'slot_taken' });
	});

	it('returns conflict when switching without a currently held priority slot', async () => {
		const { dbOperations, POST_SWITCH, NextRequest } = await loadGameParticipationHarness();
		const player = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000038',
			callsign: 'Searcher'
		});
		insertPublishedMission({
			shortCode: 'OP-SWITCH-NONE',
			slotting: createSwitchableMissionSlotting({})
		});

		const res = await POST_SWITCH(
			new NextRequest('http://localhost/api/games/OP-SWITCH-NONE/switch-slot', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					cookie: `tt_steam_session=${player.sessionId}`
				},
				body: JSON.stringify({ slotId: 'slot-priority-b' })
			}),
			gameRouteContext('OP-SWITCH-NONE')
		);

		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({ error: 'no_current_slot' });
	});

	it('lets a player leave their currently held priority slot', async () => {
		const { dbOperations, POST_LEAVE_SLOT, NextRequest } = await loadGameParticipationHarness();
		const player = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000039',
			callsign: 'Leaver'
		});
		const missionId = insertPublishedMission({
			shortCode: 'OP-LEAVE-SLOT',
			slotting: createSwitchableMissionSlotting({ currentUserId: player.userId })
		});

		const res = await POST_LEAVE_SLOT(
			new NextRequest('http://localhost/api/games/OP-LEAVE-SLOT/leave-slot', {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			gameRouteContext('OP-LEAVE-SLOT')
		);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true, left: true });

		const row = getDb()
			.prepare('SELECT slotting_json FROM missions WHERE id = ? LIMIT 1')
			.get(missionId) as { slotting_json: string };
		const saved = JSON.parse(row.slotting_json) as {
			sides: Array<{ squads: Array<{ slots: Array<{ id: string; occupant: unknown }> }> }>;
		};
		const slots = saved.sides[0].squads[0].slots;
		expect(slots.find((slot) => slot.id === 'slot-priority-a')?.occupant).toBeNull();
	});

	it('returns conflict when leaving slot without holding a priority slot', async () => {
		const { dbOperations, POST_LEAVE_SLOT, NextRequest } = await loadGameParticipationHarness();
		const player = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000040',
			callsign: 'NoHeldSlot'
		});
		insertPublishedMission({
			shortCode: 'OP-LEAVE-SLOT-NONE',
			slotting: createSwitchableMissionSlotting({})
		});

		const res = await POST_LEAVE_SLOT(
			new NextRequest('http://localhost/api/games/OP-LEAVE-SLOT-NONE/leave-slot', {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			gameRouteContext('OP-LEAVE-SLOT-NONE')
		);

		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({ error: 'no_current_slot' });
	});

	it('rejects participation for an unconfirmed Steam user', async () => {
		const { dbOperations, POST_JOIN, NextRequest } = await loadGameParticipationHarness();
		insertPublishedMission({ shortCode: 'OP-GATED', regularJoinEnabled: true });
		const inserted = dbOperations.insertApplication(
			buildTestApplicationRecord({
				email: `unconfirmed-${crypto.randomUUID()}@example.com`,
				steamid64: '76561198000000034',
				callsign: 'PendingUser'
			})
		);
		expect(inserted.success).toBe(true);
		const sessionId = createSteamSession(dbOperations, {
			steamid64: '76561198000000034',
			redirectPath: '/en/games'
		});

		const res = await POST_JOIN(
			new NextRequest('http://localhost/api/games/OP-GATED/join', {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${sessionId}` }
			}),
			gameRouteContext('OP-GATED')
		);

		expect(res.status).toBe(403);
		const json = await res.json();
		expect(json.error).toBe('forbidden');
	});
});
