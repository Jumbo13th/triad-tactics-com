import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';
import { getDb } from '../../../../fixtures/dbOperations';

async function loadAdminGamesHarness() {
	const { dbOperations } = await import('../../../../fixtures/dbOperations');
	const { GET } = await import('@/app/api/admin/games/route');
	const { POST, DELETE } = await import('@/app/api/admin/games/draft/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, GET, POST, DELETE, NextRequest };
}

describe('Admin games endpoints (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({
			prefix: 'triad-tactics-admin-games-test',
			adminSteamIds: '76561198012345678'
		});
	});

	beforeEach(async () => {
		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		dbOperations.clearAll();
	});

	it('returns empty overview initially', async () => {
		const { dbOperations, GET, NextRequest } = await loadAdminGamesHarness();
		const adminSid = createSteamSession(dbOperations, {
			steamid64: '76561198012345678',
			redirectPath: '/en/admin/games'
		});

		const res = await GET(
			new NextRequest('http://localhost/api/admin/games', {
				headers: { cookie: `tt_steam_session=${adminSid}` }
			})
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.draft).toBeNull();
		expect(json.published).toBeNull();
		expect(json.archivedMissions).toEqual([]);
	});

	it('creates a blank draft and prevents a second draft', async () => {
		const { dbOperations, GET, POST, NextRequest } = await loadAdminGamesHarness();
		const adminSid = createSteamSession(dbOperations, {
			steamid64: '76561198012345678',
			redirectPath: '/en/admin/games'
		});

		const createRes = await POST(
			new NextRequest('http://localhost/api/admin/games/draft', {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({})
			})
		);

		expect(createRes.status).toBe(200);
		const createJson = await createRes.json();
		expect(createJson.success).toBe(true);
		expect(createJson.mission.status).toBe('draft');
		expect(createJson.mission.shortCode).toBeNull();
		expect(createJson.mission.slotting).toEqual({ sides: [] });

		const secondRes = await POST(
			new NextRequest('http://localhost/api/admin/games/draft', {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({})
			})
		);

		expect(secondRes.status).toBe(409);
		const secondJson = await secondRes.json();
		expect(secondJson.error).toBe('draft_exists');

		const overviewRes = await GET(
			new NextRequest('http://localhost/api/admin/games', {
				headers: { cookie: `tt_steam_session=${adminSid}` }
			})
		);
		const overviewJson = await overviewRes.json();
		expect(overviewJson.draft?.status).toBe('draft');
		expect(overviewJson.published).toBeNull();
	});

	it('duplicates previous mission slotting and clears claimed users', async () => {
		const { dbOperations, POST, NextRequest } = await loadAdminGamesHarness();
		const adminSteamId = '76561198012345678';
		const adminSid = createSteamSession(dbOperations, {
			steamid64: adminSteamId,
			redirectPath: '/en/admin/games'
		});
		const db = getDb();
		const sourceSlotting = {
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
									id: 'slot-placeholder',
									role: 'Squad Leader',
									access: 'unit',
									occupant: { type: 'placeholder', label: 'Alpha Squad' }
								},
								{
									id: 'slot-user',
									role: 'Machine Gunner',
									access: 'priority',
									occupant: {
										type: 'user',
										userId: 123,
										callsign: 'Nomad',
										assignedBy: 'self',
										assignedAt: '2026-03-09T10:00:00.000Z'
									}
								}
							]
						}
					]
				}
			]
		};

		db.prepare(`
			INSERT INTO missions (
				short_code,
				status,
				title,
				description,
				starts_at,
				server_name,
				server_host,
				server_port,
				slotting_json,
				created_by_steamid64,
				updated_by_steamid64,
				published_by_steamid64,
				published_at
			)
			VALUES (?, 'published', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		`).run(
			'OP-1',
			'Operation One',
			'Existing published mission',
			'2026-03-10T19:00:00.000Z',
			'Triad Server',
			'127.0.0.1',
			2001,
			JSON.stringify(sourceSlotting),
			adminSteamId,
			adminSteamId,
			adminSteamId
		);

		const res = await POST(
			new NextRequest('http://localhost/api/admin/games/draft', {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ mode: 'duplicate_previous' })
			})
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.mission.status).toBe('draft');
		expect(json.mission.shortCode).toBeNull();
		expect(json.mission.title).toBe('');
		expect(json.mission.earlyPassword).toBeNull();
		expect(json.mission.finalPassword).toBeNull();
		expect(json.mission.slotting.sides[0].squads[0].slots[0].occupant).toEqual({
			type: 'placeholder',
			label: 'Alpha Squad'
		});
		expect(json.mission.slotting.sides[0].squads[0].slots[1].occupant).toBeNull();
	});

	it('deletes the current draft', async () => {
		const { dbOperations, POST, DELETE, NextRequest } = await loadAdminGamesHarness();
		const adminSid = createSteamSession(dbOperations, {
			steamid64: '76561198012345678',
			redirectPath: '/en/admin/games'
		});

		await POST(
			new NextRequest('http://localhost/api/admin/games/draft', {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({})
			})
		);

		const deleteRes = await DELETE(
			new NextRequest('http://localhost/api/admin/games/draft', {
				method: 'DELETE',
				headers: {
					origin: 'http://localhost',
					cookie: `tt_steam_session=${adminSid}`
				}
			})
		);

		expect(deleteRes.status).toBe(200);
		const deleteJson = await deleteRes.json();
		expect(deleteJson.success).toBe(true);

		const secondDelete = await DELETE(
			new NextRequest('http://localhost/api/admin/games/draft', {
				method: 'DELETE',
				headers: {
					origin: 'http://localhost',
					cookie: `tt_steam_session=${adminSid}`
				}
			})
		);

		expect(secondDelete.status).toBe(404);
		const secondJson = await secondDelete.json();
		expect(secondJson.error).toBe('not_found');
	});
});
