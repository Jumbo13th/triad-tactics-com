import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../../../fixtures/dbOperations';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';

const ADMIN_STEAM_ID = '76561198012345678';

async function loadAdminGameDetailHarness() {
	const { dbOperations } = await import('../../../../fixtures/dbOperations');
	const { GET, DELETE } = await import('@/app/api/admin/games/[missionId]/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, GET, DELETE, NextRequest };
}

function missionRouteContext(missionId: number | string) {
	return {
		params: Promise.resolve({ missionId: String(missionId) })
	};
}

function archivedSlotting() {
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
								id: 'usk-sl',
								role: 'Squad Leader',
								access: 'unit',
								occupant: { type: 'placeholder', label: 'Alpha Squad' }
							}
						]
					}
				]
			}
		]
	};
}

function insertMission(input: {
	status: 'draft' | 'published' | 'archived';
	title: string;
	shortCode: string | null;
	archiveStatus?: 'completed' | 'canceled' | null;
	archiveReason?: string | null;
	archiveResultJson?: string | null;
}): number {
	const result = getDb()
		.prepare(`
			INSERT INTO missions (
				short_code,
				status,
				title,
				description,
				server_name,
				server_host,
				server_port,
				archive_status,
				archive_reason,
				archive_result_json,
				published_at,
				archived_at,
				created_by_steamid64,
				updated_by_steamid64,
				published_by_steamid64,
				archived_by_steamid64,
				slotting_json
			)
			VALUES (?, ?, ?, '', 'Triad Server', '203.0.113.40', 2302, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`)
		.run(
			input.shortCode,
			input.status,
			input.title,
			input.archiveStatus ?? null,
			input.archiveReason ?? null,
			input.archiveResultJson ?? null,
			input.status === 'published' || input.status === 'archived' ? '2026-03-10 10:00:00' : null,
			input.status === 'archived' ? '2026-03-10 12:00:00' : null,
			ADMIN_STEAM_ID,
			ADMIN_STEAM_ID,
			input.status === 'published' || input.status === 'archived' ? ADMIN_STEAM_ID : null,
			input.status === 'archived' ? ADMIN_STEAM_ID : null,
			JSON.stringify(archivedSlotting())
		);

	const rowId = result.lastInsertRowid;
	return typeof rowId === 'bigint' ? Number(rowId) : rowId;
}

function insertAuditEvent(missionId: number, eventType: string) {
	getDb()
		.prepare(`
			INSERT INTO mission_audit_events (mission_id, actor_steamid64, event_type, payload)
			VALUES (?, ?, ?, ?)
		`)
		.run(missionId, ADMIN_STEAM_ID, eventType, JSON.stringify({ missionId }));
}

describe('Admin game detail endpoint (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({
			prefix: 'triad-tactics-admin-game-detail-test',
			adminSteamIds: ADMIN_STEAM_ID
		});
	});

	beforeEach(async () => {
		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		dbOperations.clearAll();
	});

	it('returns full archived mission detail for admins', async () => {
		const { dbOperations, GET, NextRequest } = await loadAdminGameDetailHarness();
		const missionId = insertMission({
			status: 'archived',
			title: 'Operation Archive Detail',
			shortCode: 'OP-ADMIN-ARCHIVE',
			archiveStatus: 'completed',
			archiveResultJson: JSON.stringify({
				outcome: 'winner',
				winnerSideId: 'usk',
				sideScores: [{ sideId: 'usk', sideName: 'usk', score: 5 }]
			})
		});
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const res = await GET(
			new NextRequest(`http://localhost/api/admin/games/${missionId}`, {
				headers: { cookie: `tt_steam_session=${adminSid}` }
			}),
			missionRouteContext(missionId)
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.mission).toEqual(
			expect.objectContaining({
				id: missionId,
				status: 'archived',
				shortCode: 'OP-ADMIN-ARCHIVE',
				title: 'Operation Archive Detail',
				archiveStatus: 'completed',
				archiveReason: null,
				archiveResult: {
					outcome: 'winner',
					winnerSideId: 'usk',
					sideScores: [{ sideId: 'usk', sideName: 'usk', score: 5 }]
				},
				slotting: archivedSlotting()
			})
		);
	});

	it('deletes an archived mission permanently only with exact title confirmation', async () => {
		const { dbOperations, DELETE, GET, NextRequest } = await loadAdminGameDetailHarness();
		const missionId = insertMission({
			status: 'archived',
			title: 'Operation Delete Me',
			shortCode: 'OP-DELETE-ME',
			archiveStatus: 'canceled',
			archiveReason: 'Weather'
		});
		insertAuditEvent(missionId, 'mission.canceled');
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const deleteRes = await DELETE(
			new NextRequest(`http://localhost/api/admin/games/${missionId}`, {
				method: 'DELETE',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ titleConfirmation: 'Operation Delete Me' })
			}),
			missionRouteContext(missionId)
		);

		expect(deleteRes.status).toBe(200);
		expect(await deleteRes.json()).toEqual({ success: true });

		const missionRow = getDb().prepare('SELECT 1 FROM missions WHERE id = ? LIMIT 1').get(missionId);
		expect(missionRow).toBeUndefined();

		const auditRows = getDb()
			.prepare('SELECT COUNT(1) AS count FROM mission_audit_events WHERE mission_id = ?')
			.get(missionId) as { count: number };
		expect(auditRows.count).toBe(0);

		const getRes = await GET(
			new NextRequest(`http://localhost/api/admin/games/${missionId}`, {
				headers: { cookie: `tt_steam_session=${adminSid}` }
			}),
			missionRouteContext(missionId)
		);
		expect(getRes.status).toBe(404);
		expect(await getRes.json()).toEqual({ error: 'not_found' });
	});

	it('rejects delete when title confirmation is wrong or mission is not archived', async () => {
		const { dbOperations, DELETE, NextRequest } = await loadAdminGameDetailHarness();
		const archivedMissionId = insertMission({
			status: 'archived',
			title: 'Operation Exact Title',
			shortCode: 'OP-TITLE-CHECK',
			archiveStatus: 'completed'
		});
		const publishedMissionId = insertMission({
			status: 'published',
			title: 'Operation Live Mission',
			shortCode: 'OP-LIVE-CHECK'
		});
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const mismatchRes = await DELETE(
			new NextRequest(`http://localhost/api/admin/games/${archivedMissionId}`, {
				method: 'DELETE',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ titleConfirmation: 'operation exact title' })
			}),
			missionRouteContext(archivedMissionId)
		);
		expect(mismatchRes.status).toBe(409);
		expect(await mismatchRes.json()).toEqual({ error: 'title_confirmation_mismatch' });

		const publishedRes = await DELETE(
			new NextRequest(`http://localhost/api/admin/games/${publishedMissionId}`, {
				method: 'DELETE',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ titleConfirmation: 'Operation Live Mission' })
			}),
			missionRouteContext(publishedMissionId)
		);
		expect(publishedRes.status).toBe(409);
		expect(await publishedRes.json()).toEqual({ error: 'not_archived' });
	});
});
