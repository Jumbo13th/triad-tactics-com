import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../../../fixtures/dbOperations';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';
import { buildTestApplicationRecord } from '../../../../fixtures/application';

const ADMIN_STEAM_ID = '76561198099990001';
const PLAYER_STEAM_ID = '76561198099990002';
const PLAYER2_STEAM_ID = '76561198099990003';

async function loadHarness() {
	const { dbOperations } = await import('../../../../fixtures/dbOperations');
	const { GET, PUT } = await import('@/app/api/admin/rotation/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, GET, PUT, NextRequest };
}

function seedConfirmedPlayer(
	dbOps: Awaited<ReturnType<typeof loadHarness>>['dbOperations'],
	steamid64: string,
	callsign: string
): { userId: number; sessionId: string } {
	const record = buildTestApplicationRecord({
		email: `${callsign.toLowerCase()}-${crypto.randomUUID()}@example.com`,
		steamid64,
		callsign,
	});
	const inserted = dbOps.insertApplication(record);
	if (!inserted.success) throw new Error('Failed to insert application');
	dbOps.confirmApplication(Number(inserted.id), ADMIN_STEAM_ID);
	const user = dbOps.getUserBySteamId64(steamid64);
	if (!user?.id) throw new Error('Expected confirmed user');
	dbOps.setArmaGuidByUserId({ userId: user.id, armaGuid: `test-guid-${steamid64}` });
	const sessionId = createSteamSession(dbOps, { steamid64, redirectPath: '/en' });
	return { userId: user.id, sessionId };
}

function createUnit(tag: string, name: string, createdByUserId: number): number {
	const db = getDb();
	const info = db.prepare(
		`INSERT INTO units (tag, name, description, status, slots_allocated, created_by_user_id) VALUES (?, ?, 'test', 'verified', 10, ?)`
	).run(tag, name, createdByUserId);
	return Number(info.lastInsertRowid);
}

function adminReq(
	NR: typeof import('next/server').NextRequest,
	url: string,
	opts: { method?: string; body?: unknown; sessionId: string }
) {
	const headers: Record<string, string> = {
		cookie: `tt_steam_session=${opts.sessionId}`,
		origin: 'http://localhost',
	};
	if (opts.body !== undefined) {
		headers['content-type'] = 'application/json';
	}
	return new NR(url, {
		method: opts.method ?? 'GET',
		headers,
		body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
	});
}

describe('Rotation API (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({ prefix: 'rotation-test', adminSteamIds: ADMIN_STEAM_ID });
	});

	beforeEach(async () => {
		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		dbOperations.clearAll();
	});

	describe('GET /api/admin/rotation', () => {
		it('returns 401 for unauthenticated requests', async () => {
			const h = await loadHarness();
			const res = await h.GET(new h.NextRequest('http://localhost/api/admin/rotation'));
			expect(res.status).toBe(401);
		});

		it('returns 403 for non-admin users', async () => {
			const h = await loadHarness();
			seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Player');
			const sessionId = createSteamSession(h.dbOperations, { steamid64: PLAYER_STEAM_ID });
			const res = await h.GET(adminReq(h.NextRequest, 'http://localhost/api/admin/rotation', { sessionId }));
			expect(res.status).toBe(403);
		});

		it('returns default rotation for admin', async () => {
			const h = await loadHarness();
			const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');
			const res = await h.GET(adminReq(h.NextRequest, 'http://localhost/api/admin/rotation', { sessionId: admin.sessionId }));
			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.config).toBeDefined();
			expect(json.sideA).toEqual([]);
			expect(json.sideB).toEqual([]);
			expect(json.commanderSchedule).toEqual([]);
		});
	});

	describe('PUT /api/admin/rotation - updateConfig', () => {
		it('updates side names and colors', async () => {
			const h = await loadHarness();
			const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');

			const res = await h.PUT(adminReq(h.NextRequest, 'http://localhost/api/admin/rotation', {
				method: 'PUT',
				sessionId: admin.sessionId,
				body: { action: 'updateConfig', sideAName: 'Wolves', sideBName: 'Eagles', sideAColor: '#ff0000', sideBColor: '#00ff00' },
			}));
			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.config.sideAName).toBe('Wolves');
			expect(json.config.sideBName).toBe('Eagles');
			expect(json.config.sideAColor).toBe('#ff0000');
			expect(json.config.sideBColor).toBe('#00ff00');
		});

		it('rejects invalid color format', async () => {
			const h = await loadHarness();
			const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');

			const res = await h.PUT(adminReq(h.NextRequest, 'http://localhost/api/admin/rotation', {
				method: 'PUT',
				sessionId: admin.sessionId,
				body: { action: 'updateConfig', sideAName: 'A', sideBName: 'B', sideAColor: 'not-hex', sideBColor: '#00ff00' },
			}));
			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json.error).toBe('validation_error');
		});
	});

	describe('PUT /api/admin/rotation - updateSides', () => {
		it('assigns units to sides', async () => {
			const h = await loadHarness();
			const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');
			const unitA = createUnit('ALFA', 'Alpha', admin.userId);
			const unitB = createUnit('BRVO', 'Bravo', admin.userId);

			const res = await h.PUT(adminReq(h.NextRequest, 'http://localhost/api/admin/rotation', {
				method: 'PUT',
				sessionId: admin.sessionId,
				body: { action: 'updateSides', sideA: [unitA], sideB: [unitB] },
			}));
			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.sideA).toHaveLength(1);
			expect(json.sideA[0].unitTag).toBe('ALFA');
			expect(json.sideB).toHaveLength(1);
			expect(json.sideB[0].unitTag).toBe('BRVO');
		});

		it('rejects duplicate unit across sides', async () => {
			const h = await loadHarness();
			const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');
			const unitA = createUnit('ALFA', 'Alpha', admin.userId);

			const res = await h.PUT(adminReq(h.NextRequest, 'http://localhost/api/admin/rotation', {
				method: 'PUT',
				sessionId: admin.sessionId,
				body: { action: 'updateSides', sideA: [unitA], sideB: [unitA] },
			}));
			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json.error).toBe('duplicate_unit');
		});

		it('rejects unverified unit', async () => {
			const h = await loadHarness();
			const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');
			const db = getDb();
			const info = db.prepare(
				`INSERT INTO units (tag, name, description, status, slots_allocated, created_by_user_id) VALUES ('XRAY', 'X-Ray', 'test', 'unverified', 10, ?)`
			).run(admin.userId);
			const unverifiedId = Number(info.lastInsertRowid);

			const res = await h.PUT(adminReq(h.NextRequest, 'http://localhost/api/admin/rotation', {
				method: 'PUT',
				sessionId: admin.sessionId,
				body: { action: 'updateSides', sideA: [unverifiedId], sideB: [] },
			}));
			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json.error).toBe('invalid_unit');
		});

		it('prunes orphaned commander pairs when units change sides', async () => {
			const h = await loadHarness();
			const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');
			const unitA = createUnit('ALFA', 'Alpha', admin.userId);
			const unitB = createUnit('BRVO', 'Bravo', admin.userId);
			const unitC = createUnit('CHRL', 'Charlie', admin.userId);

			await h.PUT(adminReq(h.NextRequest, 'http://localhost/api/admin/rotation', {
				method: 'PUT',
				sessionId: admin.sessionId,
				body: { action: 'updateSides', sideA: [unitA], sideB: [unitB] },
			}));

			await h.PUT(adminReq(h.NextRequest, 'http://localhost/api/admin/rotation', {
				method: 'PUT',
				sessionId: admin.sessionId,
				body: {
					action: 'updateCommanderSchedule',
					pairs: [{ sideAUnitId: unitA, sideBUnitId: unitB, scheduledDate: '2026-06-01' }],
				},
			}));

			const res = await h.PUT(adminReq(h.NextRequest, 'http://localhost/api/admin/rotation', {
				method: 'PUT',
				sessionId: admin.sessionId,
				body: { action: 'updateSides', sideA: [unitC], sideB: [unitB] },
			}));
			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.commanderSchedule).toHaveLength(0);
		});
	});

	describe('PUT /api/admin/rotation - updateCommanderSchedule', () => {
		it('creates commander pairs', async () => {
			const h = await loadHarness();
			const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');
			const unitA = createUnit('ALFA', 'Alpha', admin.userId);
			const unitB = createUnit('BRVO', 'Bravo', admin.userId);

			await h.PUT(adminReq(h.NextRequest, 'http://localhost/api/admin/rotation', {
				method: 'PUT',
				sessionId: admin.sessionId,
				body: { action: 'updateSides', sideA: [unitA], sideB: [unitB] },
			}));

			const res = await h.PUT(adminReq(h.NextRequest, 'http://localhost/api/admin/rotation', {
				method: 'PUT',
				sessionId: admin.sessionId,
				body: {
					action: 'updateCommanderSchedule',
					pairs: [
						{ sideAUnitId: unitA, sideBUnitId: unitB, scheduledDate: '2026-06-01' },
						{ sideAUnitId: unitA, sideBUnitId: unitB, scheduledDate: '2026-06-08' },
					],
				},
			}));
			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.commanderSchedule).toHaveLength(2);
			expect(json.commanderSchedule[0].scheduledDate).toBe('2026-06-01');
			expect(json.commanderSchedule[1].scheduledDate).toBe('2026-06-08');
		});

		it('rejects unit not on the correct side', async () => {
			const h = await loadHarness();
			const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');
			const unitA = createUnit('ALFA', 'Alpha', admin.userId);
			const unitB = createUnit('BRVO', 'Bravo', admin.userId);

			await h.PUT(adminReq(h.NextRequest, 'http://localhost/api/admin/rotation', {
				method: 'PUT',
				sessionId: admin.sessionId,
				body: { action: 'updateSides', sideA: [unitA], sideB: [unitB] },
			}));

			const res = await h.PUT(adminReq(h.NextRequest, 'http://localhost/api/admin/rotation', {
				method: 'PUT',
				sessionId: admin.sessionId,
				body: {
					action: 'updateCommanderSchedule',
					pairs: [{ sideAUnitId: unitB, sideBUnitId: unitA, scheduledDate: '2026-06-01' }],
				},
			}));
			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json.error).toBe('unit_not_on_side');
		});

		it('replaces existing schedule entirely', async () => {
			const h = await loadHarness();
			const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');
			const unitA = createUnit('ALFA', 'Alpha', admin.userId);
			const unitB = createUnit('BRVO', 'Bravo', admin.userId);

			await h.PUT(adminReq(h.NextRequest, 'http://localhost/api/admin/rotation', {
				method: 'PUT',
				sessionId: admin.sessionId,
				body: { action: 'updateSides', sideA: [unitA], sideB: [unitB] },
			}));

			await h.PUT(adminReq(h.NextRequest, 'http://localhost/api/admin/rotation', {
				method: 'PUT',
				sessionId: admin.sessionId,
				body: {
					action: 'updateCommanderSchedule',
					pairs: [
						{ sideAUnitId: unitA, sideBUnitId: unitB, scheduledDate: '2026-06-01' },
						{ sideAUnitId: unitA, sideBUnitId: unitB, scheduledDate: '2026-06-08' },
					],
				},
			}));

			const res = await h.PUT(adminReq(h.NextRequest, 'http://localhost/api/admin/rotation', {
				method: 'PUT',
				sessionId: admin.sessionId,
				body: {
					action: 'updateCommanderSchedule',
					pairs: [{ sideAUnitId: unitA, sideBUnitId: unitB, scheduledDate: '2026-07-01' }],
				},
			}));
			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.commanderSchedule).toHaveLength(1);
			expect(json.commanderSchedule[0].scheduledDate).toBe('2026-07-01');
		});
	});

	describe('PUT /api/admin/rotation - validation', () => {
		it('rejects unknown action', async () => {
			const h = await loadHarness();
			const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');

			const res = await h.PUT(adminReq(h.NextRequest, 'http://localhost/api/admin/rotation', {
				method: 'PUT',
				sessionId: admin.sessionId,
				body: { action: 'deleteEverything' },
			}));
			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json.error).toBe('validation_error');
		});

		it('rejects empty body', async () => {
			const h = await loadHarness();
			const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');

			const res = await h.PUT(new h.NextRequest('http://localhost/api/admin/rotation', {
				method: 'PUT',
				headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${admin.sessionId}`, origin: 'http://localhost' },
				body: JSON.stringify({}),
			}));
			expect(res.status).toBe(400);
		});
	});

	describe('full workflow', () => {
		it('config -> sides -> schedule -> verify all state is consistent', async () => {
			const h = await loadHarness();
			const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');
			const unitA1 = createUnit('A1', 'Alpha One', admin.userId);
			const unitA2 = createUnit('A2', 'Alpha Two', admin.userId);
			const unitB1 = createUnit('B1', 'Bravo One', admin.userId);

			const configRes = await h.PUT(adminReq(h.NextRequest, 'http://localhost/api/admin/rotation', {
				method: 'PUT',
				sessionId: admin.sessionId,
				body: { action: 'updateConfig', sideAName: 'Red', sideBName: 'Blue', sideAColor: '#ff0000', sideBColor: '#0000ff' },
			}));
			expect(configRes.status).toBe(200);

			const sidesRes = await h.PUT(adminReq(h.NextRequest, 'http://localhost/api/admin/rotation', {
				method: 'PUT',
				sessionId: admin.sessionId,
				body: { action: 'updateSides', sideA: [unitA1, unitA2], sideB: [unitB1] },
			}));
			expect(sidesRes.status).toBe(200);
			const sidesJson = await sidesRes.json();
			expect(sidesJson.sideA).toHaveLength(2);
			expect(sidesJson.sideB).toHaveLength(1);

			const schedRes = await h.PUT(adminReq(h.NextRequest, 'http://localhost/api/admin/rotation', {
				method: 'PUT',
				sessionId: admin.sessionId,
				body: {
					action: 'updateCommanderSchedule',
					pairs: [{ sideAUnitId: unitA1, sideBUnitId: unitB1, scheduledDate: '2026-06-15' }],
				},
			}));
			expect(schedRes.status).toBe(200);

			const getRes = await h.GET(adminReq(h.NextRequest, 'http://localhost/api/admin/rotation', { sessionId: admin.sessionId }));
			expect(getRes.status).toBe(200);
			const full = await getRes.json();
			expect(full.config.sideAName).toBe('Red');
			expect(full.config.sideBName).toBe('Blue');
			expect(full.sideA).toHaveLength(2);
			expect(full.sideB).toHaveLength(1);
			expect(full.commanderSchedule).toHaveLength(1);
			expect(full.commanderSchedule[0].sideAUnitTag).toBe('A1');
			expect(full.commanderSchedule[0].sideBUnitTag).toBe('B1');
		});
	});
});
