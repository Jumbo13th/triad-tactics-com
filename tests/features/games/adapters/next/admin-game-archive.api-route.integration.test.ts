import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApplicationRecord } from '../../../../fixtures/application';
import { getDb } from '../../../../fixtures/dbOperations';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';

const ADMIN_STEAM_ID = '76561198012345678';

async function loadAdminGameArchiveHarness() {
	const { dbOperations } = await import('../../../../fixtures/dbOperations');
	const { POST: POST_ARCHIVE } = await import('@/app/api/admin/games/[missionId]/archive/route');
	const { POST: POST_CANCEL } = await import('@/app/api/admin/games/[missionId]/cancel/route');
	const { GET: GET_CURRENT } = await import('@/app/api/games/current/route');
	const { GET: GET_MISSION } = await import('@/app/api/games/[shortCode]/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, POST_ARCHIVE, POST_CANCEL, GET_CURRENT, GET_MISSION, NextRequest };
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

function createArchiveSlotting() {
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
			},
			{
				id: 'rus',
				name: 'RUS',
				color: '#EF4444',
				squads: [
					{
						id: 'rus-1-1',
						name: '1-1',
						slots: [
							{
								id: 'rus-sl',
								role: 'Squad Leader',
								access: 'unit',
								occupant: { type: 'placeholder', label: 'Bravo Squad' }
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
	regularJoinEnabled?: boolean;
	priorityClaimManualState?: 'default' | 'open' | 'closed';
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
			slotting_json,
			created_by_steamid64,
			updated_by_steamid64,
			published_at,
			published_by_steamid64
		)
		VALUES (?, 'published', 'Operation Archive', '', 'Triad Server', '203.0.113.40', 2302, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
	`).run(
		opts?.shortCode ?? 'OP-ARCHIVE',
		early,
		final,
		opts?.priorityClaimManualState ?? 'open',
		opts?.regularJoinEnabled ? 1 : 0,
		JSON.stringify(opts?.slotting ?? createArchiveSlotting()),
		ADMIN_STEAM_ID,
		ADMIN_STEAM_ID,
		ADMIN_STEAM_ID
	);

	const rowId = result.lastInsertRowid;
	return typeof rowId === 'bigint' ? Number(rowId) : rowId;
}

function createConfirmedPlayer(
	dbOperations: Awaited<ReturnType<typeof loadAdminGameArchiveHarness>>['dbOperations'],
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

	const sessionId = createSteamSession(dbOperations, {
		steamid64: input.steamId64,
		redirectPath: '/en/games'
	});

	return { sessionId, userId: user.id };
}

describe('Admin game archive endpoints (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({
			prefix: 'triad-tactics-admin-game-archive-test',
			adminSteamIds: ADMIN_STEAM_ID
		});
	});

	beforeEach(async () => {
		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		dbOperations.clearAll();
	});

	it('archives a completed mission and auto-normalizes equal side scores into a draw', async () => {
		const { dbOperations, POST_ARCHIVE, GET_CURRENT, NextRequest } = await loadAdminGameArchiveHarness();
		const missionId = insertPublishedMission({ shortCode: 'OP-ARCHIVE-DRAW' });
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const res = await POST_ARCHIVE(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/archive`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({
					result: {
						winnerSideId: null,
						sideScores: [
							{ sideId: 'usk', score: 10 },
							{ sideId: 'rus', score: 10 }
						]
					}
				})
			}),
			missionRouteContext(missionId)
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.mission.status).toBe('archived');
		expect(json.mission.archiveStatus).toBe('completed');
		expect(json.mission.archiveReason).toBeNull();
		expect(json.mission.archiveResult).toEqual({
			outcome: 'draw',
			winnerSideId: null,
			sideScores: [
				{ sideId: 'usk', sideName: 'USK', score: 10 },
				{ sideId: 'rus', sideName: 'RUS', score: 10 }
			]
		});

		const row = getDb()
			.prepare('SELECT status, archive_status, archive_result_json FROM missions WHERE id = ? LIMIT 1')
			.get(missionId) as { status: string; archive_status: string | null; archive_result_json: string | null };
		expect(row.status).toBe('archived');
		expect(row.archive_status).toBe('completed');
		expect(JSON.parse(row.archive_result_json ?? 'null')).toEqual({
			outcome: 'draw',
			winnerSideId: null,
			sideScores: [
				{ sideId: 'usk', sideName: 'USK', score: 10 },
				{ sideId: 'rus', sideName: 'RUS', score: 10 }
			]
		});

		const currentRes = await GET_CURRENT(new NextRequest('http://localhost/api/games/current'));
		expect(currentRes.status).toBe(200);
		expect(await currentRes.json()).toEqual({ success: true, current: null });
	});

	it('rejects invalid completed archive results', async () => {
		const { dbOperations, POST_ARCHIVE, NextRequest } = await loadAdminGameArchiveHarness();
		const missionId = insertPublishedMission({ shortCode: 'OP-ARCHIVE-INVALID' });
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const res = await POST_ARCHIVE(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/archive`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({
					result: {
						winnerSideId: 'usk',
						sideScores: [{ sideId: 'usk', score: 10 }]
					}
				})
			}),
			missionRouteContext(missionId)
		);

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'archive_result_invalid' });
	});

	it('cancels a mission, removes it from current summary, and exposes archived detail', async () => {
		const { dbOperations, POST_CANCEL, GET_CURRENT, GET_MISSION, NextRequest } = await loadAdminGameArchiveHarness();
		const missionId = insertPublishedMission({
			shortCode: 'OP-CANCEL',
			regularJoinEnabled: true,
			priorityClaimManualState: 'open'
		});
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});
		const player = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000300',
			callsign: 'Nomad'
		});

		const cancelRes = await POST_CANCEL(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/cancel`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ reason: 'Server outage' })
			}),
			missionRouteContext(missionId)
		);

		expect(cancelRes.status).toBe(200);
		const cancelJson = await cancelRes.json();
		expect(cancelJson.success).toBe(true);
		expect(cancelJson.mission.status).toBe('archived');
		expect(cancelJson.mission.archiveStatus).toBe('canceled');
		expect(cancelJson.mission.archiveReason).toBe('Server outage');
		expect(cancelJson.mission.archiveResult).toBeNull();
		expect(cancelJson.mission.priorityClaimManualState).toBe('closed');
		expect(cancelJson.mission.regularJoinEnabled).toBe(false);

		const currentRes = await GET_CURRENT(new NextRequest('http://localhost/api/games/current'));
		expect(currentRes.status).toBe(200);
		expect(await currentRes.json()).toEqual({ success: true, current: null });

		const missionRes = await GET_MISSION(
			new NextRequest('http://localhost/api/games/OP-CANCEL', {
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			gameRouteContext('OP-CANCEL')
		);
		expect(missionRes.status).toBe(200);
		expect(await missionRes.json()).toEqual({
			success: true,
			mission: expect.objectContaining({
				status: 'archived',
				shortCode: 'OP-CANCEL',
				archiveStatus: 'canceled',
				archiveReason: 'Server outage',
				archiveResult: null,
				password: { stage: null, value: null, waitingForViewerAccess: false, missedJoinWindow: false },
				priorityClaimOpen: false,
				regularJoinOpen: false,
				viewer: expect.objectContaining({
					steamId64: '76561198000000300',
					canClaimPriority: false,
					canSwitchPriority: false,
					canJoinRegular: false,
					canLeaveRegular: false
				})
			})
		});
	});
});
