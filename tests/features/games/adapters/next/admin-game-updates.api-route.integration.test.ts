import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApplicationRecord } from '../../../../fixtures/application';
import { getDb } from '../../../../fixtures/dbOperations';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';

const ADMIN_STEAM_ID = '76561198012345678';

async function loadAdminGameUpdatesHarness() {
	const { dbOperations } = await import('../../../../fixtures/dbOperations');
	const { POST } = await import('@/app/api/admin/games/[missionId]/updates/route');
	const { PUT } = await import('@/app/api/admin/games/[missionId]/updates/[updateId]/route');
	const { GET: GET_MISSION } = await import('@/app/api/games/[shortCode]/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, POST, PUT, GET_MISSION, NextRequest };
}

function missionRouteContext(missionId: number | string) {
	return {
		params: Promise.resolve({ missionId: String(missionId) })
	};
}

function gameRouteContext(shortCode: string) {
	return {
		params: Promise.resolve({ shortCode })
	};
}

function missionUpdateRouteContext(missionId: number | string, updateId: number | string) {
	return {
		params: Promise.resolve({ missionId: String(missionId), updateId: String(updateId) })
	};
}

function createMissionSlotting() {
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
								id: 'slot-priority',
								role: 'Machine Gunner',
								access: 'priority',
								occupant: null
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

function insertMission(input?: {
	status?: 'draft' | 'published';
	shortCode?: string | null;
	title?: string;
}): number {
	const status = input?.status ?? 'published';
	const result = getDb()
		.prepare(`
			INSERT INTO missions (
				short_code,
				status,
				title,
				description,
				starts_at,
				server_name,
				server_host,
				server_port,
				early_password,
				final_password,
				priority_claim_manual_state,
				regular_join_enabled,
				slotting_json,
				created_by_steamid64,
				updated_by_steamid64,
				published_at,
				published_by_steamid64
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`)
		.run(
			input?.shortCode ?? (status === 'published' ? 'OP-UPDATES' : null),
			status,
			input?.title ?? 'Operation Updates',
			JSON.stringify({ en: 'Mission updates test.', ru: '', uk: '', ar: '' }),
			'2026-03-20T19:00:00.000Z',
			'Triad Server',
			'203.0.113.50',
			2302,
			'mods-pass',
			'live-pass',
			'open',
			1,
			JSON.stringify(createMissionSlotting()),
			ADMIN_STEAM_ID,
			ADMIN_STEAM_ID,
			status === 'published' ? '2026-03-20 17:00:00' : null,
			status === 'published' ? ADMIN_STEAM_ID : null
		);

	const rowId = result.lastInsertRowid;
	return typeof rowId === 'bigint' ? Number(rowId) : rowId;
}

function createConfirmedPlayer(
	dbOperations: Awaited<ReturnType<typeof loadAdminGameUpdatesHarness>>['dbOperations'],
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

describe('Admin game mission updates endpoint (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({
			prefix: 'triad-tactics-admin-game-updates-test',
			adminSteamIds: ADMIN_STEAM_ID
		});
	});

	beforeEach(async () => {
		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		dbOperations.clearAll();
	});

	it('creates predefined updates and exposes them newest-first on mission detail', async () => {
		const { dbOperations, POST, GET_MISSION, NextRequest } = await loadAdminGameUpdatesHarness();
		const missionId = insertMission({ status: 'published', shortCode: 'OP-UPDATES' });
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});
		const viewer = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000400',
			callsign: 'MissionViewer'
		});

		const firstRes = await POST(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/updates`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({
					kind: 'priority_slotting_started',
					episodeNumber: 2,
					totalEpisodes: 3
				})
			}),
			missionRouteContext(missionId)
		);

		expect(firstRes.status).toBe(200);
		const firstJson = await firstRes.json();
		expect(firstJson.success).toBe(true);
		expect(firstJson.mission.updates).toEqual([
			expect.objectContaining({
				kind: 'priority_slotting_started',
				episodeNumber: 2,
				totalEpisodes: 3,
				createdBySteamId64: ADMIN_STEAM_ID
			})
		]);

		const secondRes = await POST(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/updates`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({
					kind: 'game_started_wait_next_episode',
					episodeNumber: 2,
					totalEpisodes: 3
				})
			}),
			missionRouteContext(missionId)
		);

		expect(secondRes.status).toBe(200);
		const secondJson = await secondRes.json();
		expect(secondJson.success).toBe(true);
		expect(secondJson.mission.updates).toEqual([
			expect.objectContaining({
				kind: 'game_started_wait_next_episode',
				episodeNumber: 2,
				totalEpisodes: 3,
				createdBySteamId64: ADMIN_STEAM_ID
			}),
			expect.objectContaining({
				kind: 'priority_slotting_started',
				episodeNumber: 2,
				totalEpisodes: 3,
				createdBySteamId64: ADMIN_STEAM_ID
			})
		]);

		const publicRes = await GET_MISSION(
			new NextRequest('http://localhost/api/games/OP-UPDATES', {
				headers: { cookie: `tt_steam_session=${viewer.sessionId}` }
			}),
			gameRouteContext('OP-UPDATES')
		);

		expect(publicRes.status).toBe(200);
		const publicJson = await publicRes.json();
		expect(publicJson.success).toBe(true);
		expect(publicJson.mission.updates).toEqual([
			expect.objectContaining({
				kind: 'game_started_wait_next_episode',
				episodeNumber: 2,
				totalEpisodes: 3,
				createdBySteamId64: ADMIN_STEAM_ID
			}),
			expect.objectContaining({
				kind: 'priority_slotting_started',
				episodeNumber: 2,
				totalEpisodes: 3,
				createdBySteamId64: ADMIN_STEAM_ID
			})
		]);

		const rows = getDb()
			.prepare(
				'SELECT kind, episode_number, total_episodes, created_by_steamid64 FROM mission_public_updates WHERE mission_id = ? ORDER BY created_at DESC, id DESC'
			)
			.all(missionId) as Array<{
				kind: string;
				episode_number: number | null;
				total_episodes: number | null;
				created_by_steamid64: string | null;
			}>;
		expect(rows).toEqual([
			{
				kind: 'game_started_wait_next_episode',
				episode_number: 2,
				total_episodes: 3,
				created_by_steamid64: ADMIN_STEAM_ID
			},
			{
				kind: 'priority_slotting_started',
				episode_number: 2,
				total_episodes: 3,
				created_by_steamid64: ADMIN_STEAM_ID
			}
		]);
	});

	it('edits an existing mission update in place', async () => {
		const { dbOperations, POST, PUT, GET_MISSION, NextRequest } = await loadAdminGameUpdatesHarness();
		const missionId = insertMission({ status: 'published', shortCode: 'OP-UPDATES-EDIT' });
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});
		const viewer = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000401',
			callsign: 'EditViewer'
		});

		const createRes = await POST(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/updates`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({
					kind: 'units_slotting_started',
					episodeNumber: 1,
					totalEpisodes: 3
				})
			}),
			missionRouteContext(missionId)
		);
		expect(createRes.status).toBe(200);
		const createdJson = await createRes.json();
		const updateId = createdJson.mission.updates[0].id as number;

		const editRes = await PUT(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/updates/${updateId}`, {
				method: 'PUT',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({
					kind: 'game_started_wait_next_episode',
					episodeNumber: 2,
					totalEpisodes: 3
				})
			}),
			missionUpdateRouteContext(missionId, updateId)
		);

		expect(editRes.status).toBe(200);
		const editedJson = await editRes.json();
		expect(editedJson.success).toBe(true);
		expect(editedJson.mission.updates).toEqual([
			expect.objectContaining({
				id: updateId,
				kind: 'game_started_wait_next_episode',
				episodeNumber: 2,
				totalEpisodes: 3,
				createdBySteamId64: ADMIN_STEAM_ID
			})
		]);

		const publicRes = await GET_MISSION(
			new NextRequest('http://localhost/api/games/OP-UPDATES-EDIT', {
				headers: { cookie: `tt_steam_session=${viewer.sessionId}` }
			}),
			gameRouteContext('OP-UPDATES-EDIT')
		);
		expect(publicRes.status).toBe(200);
		const publicJson = await publicRes.json();
		expect(publicJson.mission.updates).toEqual([
			expect.objectContaining({
				id: updateId,
				kind: 'game_started_wait_next_episode',
				episodeNumber: 2,
				totalEpisodes: 3
			})
		]);

		const row = getDb()
			.prepare('SELECT id, kind, episode_number, total_episodes FROM mission_public_updates WHERE id = ? LIMIT 1')
			.get(updateId) as { id: number; kind: string; episode_number: number; total_episodes: number };
		expect(row).toEqual({
			id: updateId,
			kind: 'game_started_wait_next_episode',
			episode_number: 2,
			total_episodes: 3
		});
	});

	it('rejects editing a mission update when total episodes is omitted', async () => {
		const { dbOperations, POST, PUT, GET_MISSION, NextRequest } = await loadAdminGameUpdatesHarness();
		const missionId = insertMission({ status: 'published', shortCode: 'OP-UPDATES-EDIT-MISSING-TOTAL' });
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});
		const viewer = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000402',
			callsign: 'EditViewerMissingTotal'
		});

		const createRes = await POST(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/updates`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({
					kind: 'units_slotting_started',
					episodeNumber: 2,
					totalEpisodes: 5
				})
			}),
			missionRouteContext(missionId)
		);
		expect(createRes.status).toBe(200);
		const createdJson = await createRes.json();
		const updateId = createdJson.mission.updates[0].id as number;

		const editRes = await PUT(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/updates/${updateId}`, {
				method: 'PUT',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({
					kind: 'game_started_wait_next_episode',
					episodeNumber: 3
				})
			}),
			missionUpdateRouteContext(missionId, updateId)
		);

		expect(editRes.status).toBe(400);
		const editedJson = await editRes.json();
		expect(editedJson.error).toBe('validation_error');
		expect(editedJson.details).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: ['totalEpisodes']
				})
			])
		);

		const publicRes = await GET_MISSION(
			new NextRequest('http://localhost/api/games/OP-UPDATES-EDIT-MISSING-TOTAL', {
				headers: { cookie: `tt_steam_session=${viewer.sessionId}` }
			}),
			gameRouteContext('OP-UPDATES-EDIT-MISSING-TOTAL')
		);
		expect(publicRes.status).toBe(200);
		const publicJson = await publicRes.json();
		expect(publicJson.mission.updates).toEqual([
			expect.objectContaining({
				id: updateId,
				kind: 'units_slotting_started',
				episodeNumber: 2,
				totalEpisodes: 5
			})
		]);
	});

	it('requires an episode number for mission updates', async () => {
		const { dbOperations, POST, NextRequest } = await loadAdminGameUpdatesHarness();
		const missionId = insertMission({ status: 'published', shortCode: 'OP-UPDATES-VALIDATION' });
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const res = await POST(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/updates`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ kind: 'regular_slotting_started', totalEpisodes: 3 })
			}),
			missionRouteContext(missionId)
		);

		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json.error).toBe('validation_error');
		expect(json.details).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: ['episodeNumber']
				})
			])
		);
	});

	it('requires total episodes to be greater than or equal to the current episode', async () => {
		const { dbOperations, POST, NextRequest } = await loadAdminGameUpdatesHarness();
		const missionId = insertMission({ status: 'published', shortCode: 'OP-UPDATES-TOTALS' });
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const res = await POST(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/updates`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({
					kind: 'game_started_wait_next_episode',
					episodeNumber: 3,
					totalEpisodes: 2
				})
			}),
			missionRouteContext(missionId)
		);

		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json.error).toBe('validation_error');
		expect(json.details).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: ['totalEpisodes'],
					message: 'total_episodes_before_episode'
				})
			])
		);
	});

	it('rejects creating updates for missions that are not published', async () => {
		const { dbOperations, POST, NextRequest } = await loadAdminGameUpdatesHarness();
		const missionId = insertMission({ status: 'draft', shortCode: null, title: 'Draft Updates' });
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const res = await POST(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/updates`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({
					kind: 'units_slotting_started',
					episodeNumber: 1,
					totalEpisodes: 3
				})
			}),
			missionRouteContext(missionId)
		);

		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({ error: 'not_published' });
	});
});
