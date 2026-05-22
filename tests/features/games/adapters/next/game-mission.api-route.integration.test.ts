import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApplicationRecord } from '../../../../fixtures/application';
import { getDb } from '../../../../fixtures/dbOperations';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';

const ADMIN_STEAM_ID = '76561198012345678';

async function loadGameMissionHarness() {
	const { dbOperations } = await import('../../../../fixtures/dbOperations');
	const { GET } = await import('@/app/api/games/[shortCode]/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, GET, NextRequest };
}

function gameRouteContext(shortCode: string) {
	return {
		params: Promise.resolve({ shortCode })
	};
}

function createMissionSlotting(opts?: {
	priorityOccupantUserId?: number | null;
	includePriority?: boolean;
	includeRegular?: boolean;
}) {
	const slots: Array<Record<string, unknown>> = [];

	if (opts?.includePriority ?? true) {
		slots.push({
			id: 'slot-priority',
			role: 'Machine Gunner',
			access: 'priority',
			occupant:
				typeof opts?.priorityOccupantUserId === 'number'
					? {
						type: 'user',
						userId: opts.priorityOccupantUserId,
						callsign: 'PriorityUser',
						assignedBy: 'self',
						assignedAt: '2026-03-10T10:00:00.000Z'
					}
					: null
		});
	}

	if (opts?.includeRegular ?? true) {
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
	title?: string;
	description?: string;
	startsAt?: string | null;
	serverName?: string;
	serverHost?: string;
	serverPort?: number | null;
	priorityClaimOpensAt?: string | null;
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
	const early = opts?.earlyPassword ?? 'mods-pass';
	const final = opts?.finalPassword ?? 'live-pass';
	const result = db.prepare(`
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
			priority_claim_opens_at,
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
		VALUES (?, 'published', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
	`).run(
		opts?.shortCode ?? 'OP-DETAIL',
		opts?.title ?? 'Operation Detail',
		JSON.stringify({ en: opts?.description ?? 'Hold the line.', ru: '', uk: '', ar: '' }),
		opts?.startsAt ?? '2026-03-20T19:00:00.000Z',
		opts?.serverName ?? 'Triad Server',
		opts?.serverHost ?? '203.0.113.50',
		opts?.serverPort ?? 2302,
		early,
		final,
		opts?.priorityClaimOpensAt ?? '2026-03-20T18:00:00.000Z',
		opts?.priorityClaimManualState ?? 'open',
		opts?.regularJoinEnabled ? 1 : 0,
		opts?.priorityGameplayReleasedAt ?? null,
		opts?.regularGameplayReleasedAt ?? null,
		typeof opts?.priorityGameplayEverReleased === 'boolean' ? (opts.priorityGameplayEverReleased ? 1 : 0) : (opts?.priorityGameplayReleasedAt ? 1 : 0),
		typeof opts?.regularGameplayEverReleased === 'boolean' ? (opts.regularGameplayEverReleased ? 1 : 0) : (opts?.regularGameplayReleasedAt ? 1 : 0),
		JSON.stringify(opts?.slotting ?? createMissionSlotting()),
		ADMIN_STEAM_ID,
		ADMIN_STEAM_ID,
		ADMIN_STEAM_ID
	);

	const rowId = result.lastInsertRowid;
	return typeof rowId === 'bigint' ? Number(rowId) : rowId;
}

function insertArchivedMission(opts?: {
	shortCode?: string;
	title?: string;
	description?: string;
	startsAt?: string | null;
	serverName?: string;
	serverHost?: string;
	serverPort?: number | null;
	earlyPassword?: string | null;
	finalPassword?: string | null;
	archiveStatus?: 'completed' | 'canceled';
	archiveReason?: string | null;
	archiveResult?: unknown;
	slotting?: unknown;
}): number {
	const db = getDb();
	const early = opts?.earlyPassword ?? 'mods-pass';
	const final = opts?.finalPassword ?? 'live-pass';
	const result = db.prepare(`
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
			archive_status,
			archive_reason,
			archive_result_json,
			slotting_json,
			created_by_steamid64,
			updated_by_steamid64,
			published_at,
			published_by_steamid64,
			archived_at,
			archived_by_steamid64
		)
		VALUES (?, 'archived', ?, ?, ?, ?, ?, ?, ?, ?, 'closed', 0, ?, ?, ?, ?, ?, ?, '2026-03-20 18:00:00', ?, '2026-03-20 20:30:00', ?)
	`).run(
		opts?.shortCode ?? 'OP-ARCHIVED',
		opts?.title ?? 'Operation Archived',
		JSON.stringify({ en: opts?.description ?? 'Mission complete.', ru: '', uk: '', ar: '' }),
		opts?.startsAt ?? '2026-03-20T19:00:00.000Z',
		opts?.serverName ?? 'Triad Server',
		opts?.serverHost ?? '203.0.113.50',
		opts?.serverPort ?? 2302,
		early,
		final,
		opts?.archiveStatus ?? 'completed',
		opts?.archiveReason ?? null,
		opts?.archiveResult ? JSON.stringify(opts.archiveResult) : null,
		JSON.stringify(opts?.slotting ?? createMissionSlotting()),
		ADMIN_STEAM_ID,
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

function insertRegularReleaseSnapshot(missionId: number, userId: number, releasedAt: string) {
	getDb().prepare(`
		INSERT INTO mission_regular_release_snapshot (mission_id, user_id, released_at)
		VALUES (?, ?, ?)
	`).run(missionId, userId, releasedAt);
}

function clearFinalPassword(missionId: number) {
	getDb().prepare(`
		UPDATE missions
		SET final_password = NULL
		WHERE id = ?
	`).run(missionId);
}

function createConfirmedPlayer(
	dbOperations: Awaited<ReturnType<typeof loadGameMissionHarness>>['dbOperations'],
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

describe('Game mission endpoint (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({
			prefix: 'triad-tactics-game-mission-test',
			adminSteamIds: ADMIN_STEAM_ID
		});
	});

	beforeEach(async () => {
		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		dbOperations.clearAll();
	});

	it('returns mission detail with early password, join list, and viewer action flags', async () => {
		const { dbOperations, GET, NextRequest } = await loadGameMissionHarness();
		const missionId = insertPublishedMission({ shortCode: 'OP-DETAIL', regularJoinEnabled: true });
		const badgeId = insertBadgeType('Recon');
		assignMissionBadge(missionId, badgeId);

		const viewer = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000100',
			callsign: 'Nomad'
		});
		assignUserBadge(viewer.userId, badgeId);

		const joiner = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000101',
			callsign: 'Walker'
		});
		insertRegularJoin(missionId, joiner.userId, '76561198000000101');

		const res = await GET(
			new NextRequest('http://localhost/api/games/OP-DETAIL', {
				headers: { cookie: `tt_steam_session=${viewer.sessionId}` }
			}),
			gameRouteContext('OP-DETAIL')
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.mission).toEqual(
			expect.objectContaining({
				status: 'published',
				shortCode: 'OP-DETAIL',
				title: 'Operation Detail',
				serverName: 'Triad Server',
				serverHost: '203.0.113.50',
				serverPort: 2302,
				priorityClaimOpen: true,
				regularJoinOpen: true,
				availablePrioritySlotCount: 1,
				password: { stage: 'early', value: 'mods-pass', waitingForViewerAccess: false, missedJoinWindow: false },
				regularJoiners: [
					expect.objectContaining({ userId: joiner.userId, callsign: 'Walker' })
				],
				viewer: expect.objectContaining({
					userId: viewer.userId,
					steamId64: '76561198000000100',
					callsign: 'Nomad',
					hasPriorityBadge: true,
					priorityBadgeLabels: ['Recon'],
					heldSlotId: null,
					joinedRegular: false,
					canClaimPriority: true,
					canSwitchPriority: false,
					canJoinRegular: true,
					canLeaveRegular: false
				})
			})
		);
	});

	it('shows final password only to current priority participants after priority release', async () => {
		const { dbOperations, GET, NextRequest } = await loadGameMissionHarness();
		const priorityPlayer = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000102',
			callsign: 'PriorityOne'
		});
		const outsider = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000103',
			callsign: 'Outside'
		});

		insertPublishedMission({
			shortCode: 'OP-PRIORITY-RELEASE',
			regularJoinEnabled: true,
			priorityClaimManualState: 'closed',
			priorityGameplayReleasedAt: '2026-03-20T19:10:00.000Z',
			slotting: createMissionSlotting({ priorityOccupantUserId: priorityPlayer.userId })
		});

		const priorityRes = await GET(
			new NextRequest('http://localhost/api/games/OP-PRIORITY-RELEASE', {
				headers: { cookie: `tt_steam_session=${priorityPlayer.sessionId}` }
			}),
			gameRouteContext('OP-PRIORITY-RELEASE')
		);
		expect(priorityRes.status).toBe(200);
		const priorityJson = await priorityRes.json();
		expect(priorityJson.mission.password).toEqual({ stage: 'final', value: 'live-pass', waitingForViewerAccess: false, missedJoinWindow: false });
		expect(priorityJson.mission.priorityClaimOpen).toBe(false);
		expect(priorityJson.mission.regularJoinOpen).toBe(false);
		expect(priorityJson.mission.viewer).toEqual(
			expect.objectContaining({
				heldSlotId: 'slot-priority',
				heldSlotAccess: 'priority',
				canClaimPriority: false,
				canSwitchPriority: false
			})
		);

		const outsiderRes = await GET(
			new NextRequest('http://localhost/api/games/OP-PRIORITY-RELEASE', {
				headers: { cookie: `tt_steam_session=${outsider.sessionId}` }
			}),
			gameRouteContext('OP-PRIORITY-RELEASE')
		);
		expect(outsiderRes.status).toBe(200);
		const outsiderJson = await outsiderRes.json();
		expect(outsiderJson.mission.password).toEqual({ stage: null, value: null, waitingForViewerAccess: true, missedJoinWindow: false });
	});

	it('falls back to mod password when final password cannot be decrypted for an authorized viewer', async () => {
		const { dbOperations, GET, NextRequest } = await loadGameMissionHarness();
		const priorityPlayer = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000122',
			callsign: 'DecryptFailPriority'
		});

		const missionId = insertPublishedMission({
			shortCode: 'OP-PRIORITY-DECRYPT-FAIL',
			priorityClaimManualState: 'closed',
			priorityGameplayReleasedAt: '2026-03-20T19:10:00.000Z',
			slotting: createMissionSlotting({ priorityOccupantUserId: priorityPlayer.userId })
		});
		clearFinalPassword(missionId);

		const res = await GET(
			new NextRequest('http://localhost/api/games/OP-PRIORITY-DECRYPT-FAIL', {
				headers: { cookie: `tt_steam_session=${priorityPlayer.sessionId}` }
			}),
			gameRouteContext('OP-PRIORITY-DECRYPT-FAIL')
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.mission.password).toEqual({ stage: 'early', value: 'mods-pass', waitingForViewerAccess: false, missedJoinWindow: false });
	});

	it('shows final password to regular-release snapshot users but not late joiners', async () => {
		const { dbOperations, GET, NextRequest } = await loadGameMissionHarness();
		const snapshotUser = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000104',
			callsign: 'Snapshot'
		});
		const lateJoiner = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000105',
			callsign: 'LateJoin'
		});
		const missionId = insertPublishedMission({
			shortCode: 'OP-REGULAR-RELEASE',
			priorityClaimManualState: 'closed',
			priorityGameplayReleasedAt: '2026-03-20T19:10:00.000Z',
			regularGameplayReleasedAt: '2026-03-20T19:20:00.000Z',
			slotting: createMissionSlotting({ includePriority: false, includeRegular: true })
		});
		insertRegularJoin(missionId, snapshotUser.userId, '76561198000000104');
		insertRegularJoin(missionId, lateJoiner.userId, '76561198000000105');
		insertRegularReleaseSnapshot(missionId, snapshotUser.userId, '2026-03-20T19:20:00.000Z');

		const snapshotRes = await GET(
			new NextRequest('http://localhost/api/games/OP-REGULAR-RELEASE', {
				headers: { cookie: `tt_steam_session=${snapshotUser.sessionId}` }
			}),
			gameRouteContext('OP-REGULAR-RELEASE')
		);
		expect(snapshotRes.status).toBe(200);
		const snapshotJson = await snapshotRes.json();
		expect(snapshotJson.mission.password).toEqual({ stage: 'final', value: 'live-pass', waitingForViewerAccess: false, missedJoinWindow: false });
		expect(snapshotJson.mission.viewer).toEqual(
			expect.objectContaining({
				joinedRegular: true,
				canJoinRegular: false,
				canLeaveRegular: true
			})
		);

		const lateJoinerRes = await GET(
			new NextRequest('http://localhost/api/games/OP-REGULAR-RELEASE', {
				headers: { cookie: `tt_steam_session=${lateJoiner.sessionId}` }
			}),
			gameRouteContext('OP-REGULAR-RELEASE')
		);
		expect(lateJoinerRes.status).toBe(200);
		const lateJoinerJson = await lateJoinerRes.json();
		expect(lateJoinerJson.mission.password).toEqual({ stage: null, value: null, waitingForViewerAccess: false, missedJoinWindow: true });
	});

	it('reopens regular join and shows early password after both gameplay stages were hidden', async () => {
		const { dbOperations, GET, NextRequest } = await loadGameMissionHarness();
		const viewer = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000108',
			callsign: 'LateViewer'
		});

		insertPublishedMission({
			shortCode: 'OP-HIDDEN-AFTER-RELEASE',
			regularJoinEnabled: true,
			priorityGameplayReleasedAt: null,
			regularGameplayReleasedAt: null,
			priorityGameplayEverReleased: true,
			regularGameplayEverReleased: true
		});

		const res = await GET(
			new NextRequest('http://localhost/api/games/OP-HIDDEN-AFTER-RELEASE', {
				headers: { cookie: `tt_steam_session=${viewer.sessionId}` }
			}),
			gameRouteContext('OP-HIDDEN-AFTER-RELEASE')
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.mission.regularJoinOpen).toBe(true);
		expect(json.mission.password.stage).toBe('early');
	});

	it('does not mark joined regular participants as missed after both gameplay stages were hidden', async () => {
		const { dbOperations, GET, NextRequest } = await loadGameMissionHarness();
		const viewer = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000109',
			callsign: 'EpisodeRegular'
		});

		const missionId = insertPublishedMission({
			shortCode: 'OP-HIDDEN-AFTER-RELEASE-JOINED',
			regularJoinEnabled: true,
			priorityGameplayReleasedAt: null,
			regularGameplayReleasedAt: null,
			priorityGameplayEverReleased: true,
			regularGameplayEverReleased: true
		});
		insertRegularJoin(missionId, viewer.userId, '76561198000000109');

		const res = await GET(
			new NextRequest('http://localhost/api/games/OP-HIDDEN-AFTER-RELEASE-JOINED', {
				headers: { cookie: `tt_steam_session=${viewer.sessionId}` }
			}),
			gameRouteContext('OP-HIDDEN-AFTER-RELEASE-JOINED')
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.mission.regularJoinOpen).toBe(true);
		expect(json.mission.viewer.joinedRegular).toBe(true);
		expect(json.mission.password.stage).toBe('early');
	});

	it('rejects unconfirmed users from loading mission detail', async () => {
		const { dbOperations, GET, NextRequest } = await loadGameMissionHarness();
		insertPublishedMission({ shortCode: 'OP-GATED' });
		const inserted = dbOperations.insertApplication(
			buildTestApplicationRecord({
				email: `pending-${crypto.randomUUID()}@example.com`,
				steamid64: '76561198000000106',
				callsign: 'PendingUser'
			})
		);
		expect(inserted.success).toBe(true);
		const sessionId = createSteamSession(dbOperations, {
			steamid64: '76561198000000106',
			redirectPath: '/en/games'
		});

		const res = await GET(
			new NextRequest('http://localhost/api/games/OP-GATED', {
				headers: { cookie: `tt_steam_session=${sessionId}` }
			}),
			gameRouteContext('OP-GATED')
		);

		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: 'forbidden' });
	});

	it('returns archived mission detail with final result and without any password access', async () => {
		const { dbOperations, GET, NextRequest } = await loadGameMissionHarness();
		insertArchivedMission({
			shortCode: 'OP-ARCHIVED-RESULT',
			archiveStatus: 'completed',
			archiveResult: {
				outcome: 'winner',
				winnerSideId: 'usk',
				sideScores: [
					{ sideId: 'usk', sideName: 'usk', score: 12 },
					{ sideId: 'rus', sideName: 'rus', score: 8 }
				]
			}
		});
		const viewer = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000107',
			callsign: 'ArchiveViewer'
		});

		const res = await GET(
			new NextRequest('http://localhost/api/games/OP-ARCHIVED-RESULT', {
				headers: { cookie: `tt_steam_session=${viewer.sessionId}` }
			}),
			gameRouteContext('OP-ARCHIVED-RESULT')
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.mission).toEqual(
			expect.objectContaining({
				status: 'archived',
				shortCode: 'OP-ARCHIVED-RESULT',
				archiveStatus: 'completed',
				archiveReason: null,
				archiveResult: {
					outcome: 'winner',
					winnerSideId: 'usk',
					sideScores: [
						{ sideId: 'usk', sideName: 'usk', score: 12 },
						{ sideId: 'rus', sideName: 'rus', score: 8 }
					]
				},
				priorityClaimOpen: false,
				regularJoinOpen: false,
				password: { stage: null, value: null, waitingForViewerAccess: false, missedJoinWindow: false },
				viewer: expect.objectContaining({
					steamId64: '76561198000000107',
					canClaimPriority: false,
					canSwitchPriority: false,
					canJoinRegular: false,
					canLeaveRegular: false
				})
			})
		);
	});
});
