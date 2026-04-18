import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../../../fixtures/dbOperations';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';
import { buildTestApplicationRecord } from '../../../../fixtures/application';

const ADMIN_STEAM_ID = '76561198099990001';
const PLAYER_STEAM_ID = '76561198099990002';
const PLAYER2_STEAM_ID = '76561198099990003';

const UNIT_BODY = {
	name: 'Alpha Team', tag: 'ALFA', description: 'First unit',
	memberNames: 'Player1\nPlayer2\nPlayer3\nPlayer4\nPlayer5\nPlayer6',
	history: 'We have been playing together for years on various servers.',
	otherProjects: 'We also play on ProjectX',
	acceptSundaySchedule: true,
	acceptSideCommanderRole: true
};

function unitContext(unitId: number | string) {
	return { params: Promise.resolve({ unitId: String(unitId) }) };
}

async function loadHarness() {
	const { dbOperations } = await import('../../../../fixtures/dbOperations');
	const { GET: GET_UNITS, POST: POST_UNITS } = await import('@/app/api/units/route');
	const { GET: GET_UNIT, PUT: PUT_UNIT, DELETE: DELETE_UNIT } = await import('@/app/api/units/[unitId]/route');
	const { GET: GET_ADMIN_UNITS } = await import('@/app/api/admin/units/route');
	const { GET: GET_ADMIN_UNIT, PUT: PUT_ADMIN_UNIT } = await import('@/app/api/admin/units/[unitId]/route');
	const { POST: POST_VERIFY } = await import('@/app/api/admin/units/[unitId]/verify/route');
	const { POST: POST_SLOTS } = await import('@/app/api/admin/units/[unitId]/slots/route');
	const { POST: POST_LEADER } = await import('@/app/api/admin/units/[unitId]/leader/route');
	const { NextRequest } = await import('next/server');
	return {
		dbOperations, GET_UNITS, POST_UNITS, GET_UNIT, PUT_UNIT, DELETE_UNIT,
		GET_ADMIN_UNITS, GET_ADMIN_UNIT, PUT_ADMIN_UNIT,
		POST_VERIFY, POST_SLOTS, POST_LEADER, NextRequest
	};
}

function seedConfirmedPlayer(dbOps: Awaited<ReturnType<typeof loadHarness>>['dbOperations'], steamid64: string, callsign: string): { userId: number; sessionId: string } {
	const record = buildTestApplicationRecord({
		email: `${callsign.toLowerCase()}-${crypto.randomUUID()}@example.com`,
		steamid64,
		callsign
	});
	const inserted = dbOps.insertApplication(record);
	if (!inserted.success) throw new Error('Failed to insert application');
	const applicationId = Number(inserted.id);
	dbOps.confirmApplication(applicationId, ADMIN_STEAM_ID);
	const user = dbOps.getUserBySteamId64(steamid64);
	if (!user?.id) throw new Error('Expected confirmed user');
	const sessionId = createSteamSession(dbOps, { steamid64, redirectPath: '/en/units' });
	return { userId: user.id, sessionId };
}

describe('Unit CRUD (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({ prefix: 'unit-crud-test', adminSteamIds: ADMIN_STEAM_ID });
	});

	beforeEach(async () => {
		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		dbOperations.clearAll();
	});

	it('creates a unit with questionnaire and gets it back', async () => {
		const h = await loadHarness();
		const p = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Alpha');

		const createRes = await h.POST_UNITS(new h.NextRequest('http://localhost/api/units', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${p.sessionId}` },
			body: JSON.stringify(UNIT_BODY)
		}));
		expect(createRes.status).toBe(201);
		const { id } = await createRes.json();
		expect(id).toBeGreaterThan(0);

		const getRes = await h.GET_UNIT(
			new h.NextRequest(`http://localhost/api/units/${id}`, {
				headers: { cookie: `tt_steam_session=${p.sessionId}` }
			}),
			unitContext(id)
		);
		expect(getRes.status).toBe(200);
		const detail = await getRes.json();
		expect(detail.unit.name).toBe('Alpha Team');
		expect(detail.unit.tag).toBe('ALFA');
		expect(detail.unit.status).toBe('unverified');
		expect(detail.unit.memberCount).toBe(1);
		expect(detail.unit.memberNames).toContain('Player1');
		expect(detail.unit.history).toContain('playing together');
		expect(detail.viewer.isLeader).toBe(true);
		expect(detail.viewer.isMember).toBe(true);
	});

	it('rejects creation without questionnaire fields', async () => {
		const h = await loadHarness();
		const p = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Player1');

		const res = await h.POST_UNITS(new h.NextRequest('http://localhost/api/units', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${p.sessionId}` },
			body: JSON.stringify({ name: 'Test', tag: 'TST' })
		}));
		expect(res.status).toBe(400);
		expect((await res.json()).error).toBe('validation_error');
	});

	it('prevents duplicate tags', async () => {
		const h = await loadHarness();
		const p1 = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Player1');
		const p2 = seedConfirmedPlayer(h.dbOperations, PLAYER2_STEAM_ID, 'Player2');

		await h.POST_UNITS(new h.NextRequest('http://localhost/api/units', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${p1.sessionId}` },
			body: JSON.stringify(UNIT_BODY)
		}));

		const res = await h.POST_UNITS(new h.NextRequest('http://localhost/api/units', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${p2.sessionId}` },
			body: JSON.stringify({ ...UNIT_BODY, name: 'Another Team' })
		}));
		expect(res.status).toBe(409);
		expect((await res.json()).error).toBe('tag_taken');
	});

	it('prevents creating second unit when already a member (including unverified)', async () => {
		const h = await loadHarness();
		const p = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Player1');

		await h.POST_UNITS(new h.NextRequest('http://localhost/api/units', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${p.sessionId}` },
			body: JSON.stringify(UNIT_BODY)
		}));

		const res = await h.POST_UNITS(new h.NextRequest('http://localhost/api/units', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${p.sessionId}` },
			body: JSON.stringify({ ...UNIT_BODY, name: 'Second Unit', tag: 'TWO' })
		}));
		expect(res.status).toBe(409);
		expect((await res.json()).error).toBe('already_in_unit');
	});

	it('admin can verify, unverify, and delete a unit', async () => {
		const h = await loadHarness();
		const player = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Player1');
		const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'AdminPlayer');

		const createRes = await h.POST_UNITS(new h.NextRequest('http://localhost/api/units', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${player.sessionId}` },
			body: JSON.stringify({ ...UNIT_BODY, name: 'Bravo Team', tag: 'BRV' })
		}));
		const { id } = await createRes.json();

		const listBefore = await h.GET_UNITS(new h.NextRequest('http://localhost/api/units'));
		expect((await listBefore.json()).units).toHaveLength(0);

		const verifyRes = await h.POST_VERIFY(
			new h.NextRequest(`http://localhost/api/admin/units/${id}/verify`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${admin.sessionId}`, origin: 'http://localhost' },
				body: JSON.stringify({ action: 'verify' })
			}),
			unitContext(id)
		);
		expect(verifyRes.status).toBe(200);

		const listAfter = await h.GET_UNITS(new h.NextRequest('http://localhost/api/units'));
		expect((await listAfter.json()).units).toHaveLength(1);

		const unverifyRes = await h.POST_VERIFY(
			new h.NextRequest(`http://localhost/api/admin/units/${id}/verify`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${admin.sessionId}`, origin: 'http://localhost' },
				body: JSON.stringify({ action: 'unverify' })
			}),
			unitContext(id)
		);
		expect(unverifyRes.status).toBe(200);

		const listUnverified = await h.GET_UNITS(new h.NextRequest('http://localhost/api/units'));
		expect((await listUnverified.json()).units).toHaveLength(0);

		const deleteRes = await h.POST_VERIFY(
			new h.NextRequest(`http://localhost/api/admin/units/${id}/verify`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${admin.sessionId}`, origin: 'http://localhost' },
				body: JSON.stringify({ action: 'delete' })
			}),
			unitContext(id)
		);
		expect(deleteRes.status).toBe(200);

		const detailRes = await h.GET_UNIT(
			new h.NextRequest(`http://localhost/api/units/${id}`, {
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			unitContext(id)
		);
		expect(detailRes.status).toBe(404);
	});

	it('admin can set slots and change leader', async () => {
		const h = await loadHarness();
		const player = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Player1');
		const player2 = seedConfirmedPlayer(h.dbOperations, PLAYER2_STEAM_ID, 'Player2');
		const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'AdminPlayer');

		const createRes = await h.POST_UNITS(new h.NextRequest('http://localhost/api/units', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${player.sessionId}` },
			body: JSON.stringify({ ...UNIT_BODY, name: 'Charlie Unit', tag: 'CHL' })
		}));
		const { id } = await createRes.json();

		getDb().prepare(`INSERT INTO unit_memberships (unit_id, user_id, role) VALUES (?, ?, 'member')`).run(id, player2.userId);

		const slotsRes = await h.POST_SLOTS(
			new h.NextRequest(`http://localhost/api/admin/units/${id}/slots`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${admin.sessionId}`, origin: 'http://localhost' },
				body: JSON.stringify({ slotsAllocated: 12 })
			}),
			unitContext(id)
		);
		expect(slotsRes.status).toBe(200);

		const leaderRes = await h.POST_LEADER(
			new h.NextRequest(`http://localhost/api/admin/units/${id}/leader`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${admin.sessionId}`, origin: 'http://localhost' },
				body: JSON.stringify({ userId: player2.userId })
			}),
			unitContext(id)
		);
		expect(leaderRes.status).toBe(200);

		const detailRes = await h.GET_ADMIN_UNIT(
			new h.NextRequest(`http://localhost/api/admin/units/${id}`, {
				headers: { cookie: `tt_steam_session=${admin.sessionId}` }
			}),
			unitContext(id)
		);
		const detail = await detailRes.json();
		expect(detail.unit.slotsAllocated).toBe(12);
		expect(detail.unit.leaderUserId).toBe(player2.userId);
	});

	it('leader can edit description and join message', async () => {
		const h = await loadHarness();
		const player = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Player1');
		const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'AdminPlayer');

		const createRes = await h.POST_UNITS(new h.NextRequest('http://localhost/api/units', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${player.sessionId}` },
			body: JSON.stringify({ ...UNIT_BODY, name: 'Delta Unit', tag: 'DLT' })
		}));
		const { id } = await createRes.json();

		await h.POST_VERIFY(
			new h.NextRequest(`http://localhost/api/admin/units/${id}/verify`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${admin.sessionId}`, origin: 'http://localhost' },
				body: JSON.stringify({ action: 'verify' })
			}),
			unitContext(id)
		);

		const editRes = await h.PUT_UNIT(
			new h.NextRequest(`http://localhost/api/units/${id}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${player.sessionId}` },
				body: JSON.stringify({ description: 'Updated desc', joinMessage: 'Tell us about yourself' })
			}),
			unitContext(id)
		);
		expect(editRes.status).toBe(200);

		const detail = await (await h.GET_UNIT(
			new h.NextRequest(`http://localhost/api/units/${id}`, {
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			unitContext(id)
		)).json();
		expect(detail.unit.description).toBe('Updated desc');
		expect(detail.unit.joinMessage).toBe('Tell us about yourself');
	});

	it('leader can delete their own unit', async () => {
		const h = await loadHarness();
		const player = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Player1');

		const createRes = await h.POST_UNITS(new h.NextRequest('http://localhost/api/units', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${player.sessionId}` },
			body: JSON.stringify({ ...UNIT_BODY, name: 'Delete Me', tag: 'DEL' })
		}));
		const { id } = await createRes.json();

		const deleteRes = await h.DELETE_UNIT(
			new h.NextRequest(`http://localhost/api/units/${id}`, {
				method: 'DELETE',
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			unitContext(id)
		);
		expect(deleteRes.status).toBe(200);

		const detailRes = await h.GET_UNIT(
			new h.NextRequest(`http://localhost/api/units/${id}`, {
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			unitContext(id)
		);
		expect(detailRes.status).toBe(404);
	});

	it('non-leader cannot delete a unit', async () => {
		const h = await loadHarness();
		const player = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Player1');
		const player2 = seedConfirmedPlayer(h.dbOperations, PLAYER2_STEAM_ID, 'Player2');

		const createRes = await h.POST_UNITS(new h.NextRequest('http://localhost/api/units', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${player.sessionId}` },
			body: JSON.stringify({ ...UNIT_BODY, name: 'No Delete', tag: 'NDL' })
		}));
		const { id } = await createRes.json();

		const deleteRes = await h.DELETE_UNIT(
			new h.NextRequest(`http://localhost/api/units/${id}`, {
				method: 'DELETE',
				headers: { cookie: `tt_steam_session=${player2.sessionId}` }
			}),
			unitContext(id)
		);
		expect(deleteRes.status).toBe(403);
	});

	it('unit events are recorded on creation and verification', async () => {
		const h = await loadHarness();
		const player = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Player1');
		const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'AdminPlayer');

		const createRes = await h.POST_UNITS(new h.NextRequest('http://localhost/api/units', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${player.sessionId}` },
			body: JSON.stringify({ ...UNIT_BODY, name: 'Event Unit', tag: 'EVT' })
		}));
		const { id } = await createRes.json();

		await h.POST_VERIFY(
			new h.NextRequest(`http://localhost/api/admin/units/${id}/verify`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${admin.sessionId}`, origin: 'http://localhost' },
				body: JSON.stringify({ action: 'verify' })
			}),
			unitContext(id)
		);

		const detail = await (await h.GET_UNIT(
			new h.NextRequest(`http://localhost/api/units/${id}`, {
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			unitContext(id)
		)).json();

		expect(detail.events.length).toBeGreaterThanOrEqual(2);
		const kinds = detail.events.map((e: { kind: string }) => e.kind);
		expect(kinds).toContain('created');
		expect(kinds).toContain('verified');
	});

	it('hasSlots filter works on public list', async () => {
		const h = await loadHarness();
		const p1 = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Player1');
		const p2 = seedConfirmedPlayer(h.dbOperations, PLAYER2_STEAM_ID, 'Player2');
		const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'AdminPlayer');

		const r1 = await h.POST_UNITS(new h.NextRequest('http://localhost/api/units', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${p1.sessionId}` },
			body: JSON.stringify({ ...UNIT_BODY, name: 'With Slots', tag: 'WS' })
		}));
		const id1 = (await r1.json()).id;

		const r2 = await h.POST_UNITS(new h.NextRequest('http://localhost/api/units', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${p2.sessionId}` },
			body: JSON.stringify({ ...UNIT_BODY, name: 'No Slots', tag: 'NS' })
		}));
		const id2 = (await r2.json()).id;

		for (const id of [id1, id2]) {
			await h.POST_VERIFY(
				new h.NextRequest(`http://localhost/api/admin/units/${id}/verify`, {
					method: 'POST',
					headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${admin.sessionId}`, origin: 'http://localhost' },
					body: JSON.stringify({ action: 'verify' })
				}),
				unitContext(id)
			);
		}

		await h.POST_SLOTS(
			new h.NextRequest(`http://localhost/api/admin/units/${id1}/slots`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${admin.sessionId}`, origin: 'http://localhost' },
				body: JSON.stringify({ slotsAllocated: 10 })
			}),
			unitContext(id1)
		);

		const allRes = await h.GET_UNITS(new h.NextRequest('http://localhost/api/units'));
		expect((await allRes.json()).units).toHaveLength(2);

		const withSlotsRes = await h.GET_UNITS(new h.NextRequest('http://localhost/api/units?hasSlots=true'));
		const withSlots = await withSlotsRes.json();
		expect(withSlots.units).toHaveLength(1);
		expect(withSlots.units[0].tag).toBe('WS');
	});

	it('enforces name length limit (max 20) and tag length limit (max 6)', async () => {
		const h = await loadHarness();
		const p = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Player1');

		const longNameRes = await h.POST_UNITS(new h.NextRequest('http://localhost/api/units', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${p.sessionId}` },
			body: JSON.stringify({ ...UNIT_BODY, name: 'A'.repeat(21), tag: 'OK' })
		}));
		expect(longNameRes.status).toBe(400);

		const longTagRes = await h.POST_UNITS(new h.NextRequest('http://localhost/api/units', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${p.sessionId}` },
			body: JSON.stringify({ ...UNIT_BODY, name: 'Valid', tag: 'TOOLONG1' })
		}));
		expect(longTagRes.status).toBe(400);
	});

	it('player can create unit again after their unit is deleted', async () => {
		const h = await loadHarness();
		const player = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Player1');

		const createRes = await h.POST_UNITS(new h.NextRequest('http://localhost/api/units', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${player.sessionId}` },
			body: JSON.stringify(UNIT_BODY)
		}));
		const { id } = await createRes.json();

		await h.DELETE_UNIT(
			new h.NextRequest(`http://localhost/api/units/${id}`, {
				method: 'DELETE',
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			unitContext(id)
		);

		const secondRes = await h.POST_UNITS(new h.NextRequest('http://localhost/api/units', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${player.sessionId}` },
			body: JSON.stringify({ ...UNIT_BODY, name: 'New Unit', tag: 'NEW' })
		}));
		expect(secondRes.status).toBe(201);
	});
});
