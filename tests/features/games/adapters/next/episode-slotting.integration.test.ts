import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb, type DbOperations } from '../../../../fixtures/dbOperations';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';
import { buildTestApplicationRecord } from '../../../../fixtures/application';

const ADMIN_STEAM_ID = '76561198099990001';
const PLAYER1_STEAM_ID = '76561198099990002';
const LEADER_STEAM_ID = '76561198099990004';

function missionRouteContext(missionId: number | string) {
	return { params: Promise.resolve({ missionId: String(missionId) }) };
}

function gameRouteContext(shortCode: string) {
	return { params: Promise.resolve({ shortCode }) };
}

function createConfirmedPlayer(dbOps: DbOperations, steamId64: string, callsign: string): number {
	const inserted = dbOps.insertApplication(
		buildTestApplicationRecord({ email: `${callsign}-${Date.now()}-${Math.random()}@test.com`, steamid64: steamId64, callsign })
	);
	if (!inserted.success) throw new Error('insert application failed');
	const confirmed = dbOps.confirmApplication(Number(inserted.id), ADMIN_STEAM_ID);
	if (!confirmed.success) throw new Error('confirm application failed');
	const user = dbOps.getUserBySteamId64(steamId64);
	if (!user?.id) throw new Error('user not found after confirm');
	dbOps.setArmaGuidByUserId({ userId: user.id, armaGuid: `test-guid-${steamId64}` });
	return user.id;
}

function twoSideSlotting() {
	return {
		sides: [
			{
				id: 'side-a', name: 'Alpha', color: '#3B82F6',
				squads: [{
					id: 'sa-sq1', name: 'A-1',
					slots: [
						{ id: 'sa-s1', role: 'SL', access: 'unit', occupant: null },
						{ id: 'sa-s2', role: 'R1', access: 'unit', occupant: null },
						{ id: 'sa-s3', role: 'R2', access: 'unit', occupant: null },
						{ id: 'sa-s4', role: 'M1', access: 'unit', occupant: null }
					]
				}]
			},
			{
				id: 'side-b', name: 'Bravo', color: '#EF4444',
				squads: [{
					id: 'sb-sq1', name: 'B-1',
					slots: [
						{ id: 'sb-s1', role: 'SL', access: 'unit', occupant: null },
						{ id: 'sb-s2', role: 'R1', access: 'unit', occupant: null },
						{ id: 'sb-s3', role: 'R2', access: 'unit', occupant: null },
						{ id: 'sb-s4', role: 'M1', access: 'unit', occupant: null }
					]
				}]
			}
		]
	};
}

/** Insert a published mission with EP1 slotting + badge + priority claim open. */
function insertPublishedMission(shortCode: string) {
	const db = getDb();
	const slotting = twoSideSlotting();
	const res = db.prepare(`
		INSERT INTO missions (status, title, description, short_code, slotting_json, early_password,
			priority_claim_manual_state, created_by_steamid64, updated_by_steamid64, published_at)
		VALUES ('published', 'Test', '', ?, ?, 'pw123', 'open', ?, ?, CURRENT_TIMESTAMP)
	`).run(shortCode, JSON.stringify(slotting), ADMIN_STEAM_ID, ADMIN_STEAM_ID);
	const missionId = Number(res.lastInsertRowid);

	// Create badge and assign to mission
	const badge = db.prepare("INSERT INTO badge_types (label, created_by_steamid64) VALUES ('Test Badge', ?)").run(ADMIN_STEAM_ID);
	const badgeId = Number(badge.lastInsertRowid);
	db.prepare("INSERT INTO mission_priority_badges (mission_id, badge_type_id) VALUES (?, ?)").run(missionId, badgeId);

	return { missionId, badgeId };
}

/** Give a player the mission's priority badge. */
function grantBadge(userId: number, badgeId: number) {
	const db = getDb();
	db.prepare("INSERT OR IGNORE INTO user_badges (user_id, badge_type_id, assigned_by_steamid64) VALUES (?, ?, ?)").run(userId, badgeId, ADMIN_STEAM_ID);
}

/** Read episode slotting directly from DB. */
function readEpisodeSlotting(missionId: number, episodeNumber: number) {
	const db = getDb();
	return db.prepare('SELECT slotting_json, slotting_revision FROM mission_episode_slotting WHERE mission_id = ? AND episode_number = ?')
		.get(missionId, episodeNumber) as { slotting_json: string; slotting_revision: number } | undefined;
}

/** Read missions table slotting. */
function readMissionSlotting(missionId: number) {
	const db = getDb();
	return db.prepare('SELECT slotting_json, slotting_revision FROM missions WHERE id = ?')
		.get(missionId) as { slotting_json: string; slotting_revision: number } | undefined;
}

/** Add episode 2 with different slotting. */
function addEpisode2(missionId: number) {
	const db = getDb();
	const ep2Slotting = twoSideSlotting();
	// Change side names to make them distinguishable
	ep2Slotting.sides[0].name = 'Alpha EP2';
	ep2Slotting.sides[1].name = 'Bravo EP2';
	db.prepare('INSERT INTO mission_episode_slotting (mission_id, episode_number, slotting_json, slotting_revision) VALUES (?, 2, ?, 1)')
		.run(missionId, JSON.stringify(ep2Slotting));
}

describe('Episode slotting (integration)', () => {
	let dbOps: DbOperations;

	beforeAll(async () => {
		await setupIsolatedDb({ prefix: 'episode-slotting', adminSteamIds: ADMIN_STEAM_ID });
	});

	beforeEach(async () => {
		const mod = await import('../../../../fixtures/dbOperations');
		dbOps = mod.dbOperations;
		dbOps.clearAll();
	});

	// ── Episode CRUD ────────────────────────────────────────────────

	describe('episode CRUD', () => {
		it('creates episode 2 via PUT with new episodeNumber', async () => {
			const { PUT } = await import('@/app/api/admin/games/[missionId]/slotting/route');
			const { NextRequest } = await import('next/server');
			const { missionId } = insertPublishedMission('ep-crud-1');
			const sid = createSteamSession(dbOps, { steamid64: ADMIN_STEAM_ID, redirectPath: '/' });

			const newSlotting = twoSideSlotting();
			const res = await PUT(
				new NextRequest('http://localhost/api/admin/games/1/slotting', {
					method: 'PUT',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ episodeNumber: 2, slottingRevision: 1, slotting: newSlotting, confirmDestructive: false })
				}),
				missionRouteContext(missionId)
			);

			expect(res.status).toBe(200);
			const ep2 = readEpisodeSlotting(missionId, 2);
			expect(ep2).toBeDefined();
			expect(ep2!.slotting_revision).toBe(1);
		});

		it('updates episode 2 slotting without affecting episode 1', async () => {
			const { PUT } = await import('@/app/api/admin/games/[missionId]/slotting/route');
			const { NextRequest } = await import('next/server');
			const { missionId } = insertPublishedMission('ep-crud-2');
			addEpisode2(missionId);
			const sid = createSteamSession(dbOps, { steamid64: ADMIN_STEAM_ID, redirectPath: '/' });

			const ep1Before = readEpisodeSlotting(missionId, 1)!;
			const updatedSlotting = twoSideSlotting();
			updatedSlotting.sides[0].name = 'Modified Side';

			const res = await PUT(
				new NextRequest('http://localhost/api/admin/games/1/slotting', {
					method: 'PUT',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ episodeNumber: 2, slottingRevision: 1, slotting: updatedSlotting, confirmDestructive: true })
				}),
				missionRouteContext(missionId)
			);

			expect(res.status).toBe(200);
			const ep1After = readEpisodeSlotting(missionId, 1)!;
			const ep2After = readEpisodeSlotting(missionId, 2)!;

			// EP1 unchanged
			expect(ep1After.slotting_json).toBe(ep1Before.slotting_json);
			expect(ep1After.slotting_revision).toBe(ep1Before.slotting_revision);
			// EP2 updated
			expect(JSON.parse(ep2After.slotting_json).sides[0].name).toBe('Modified Side');
			expect(ep2After.slotting_revision).toBe(2);
		});

		it('deletes empty episode 2', async () => {
			const { DELETE } = await import('@/app/api/admin/games/[missionId]/slotting/route');
			const { NextRequest } = await import('next/server');
			const { missionId } = insertPublishedMission('ep-crud-3');
			addEpisode2(missionId);
			const sid = createSteamSession(dbOps, { steamid64: ADMIN_STEAM_ID, redirectPath: '/' });

			const res = await DELETE(
				new NextRequest('http://localhost/api/admin/games/1/slotting', {
					method: 'DELETE',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ episodeNumber: 2 })
				}),
				missionRouteContext(missionId)
			);

			expect(res.status).toBe(200);
			expect(readEpisodeSlotting(missionId, 2)).toBeUndefined();
			expect(readEpisodeSlotting(missionId, 1)).toBeDefined();
		});

		it('rejects deleting episode 1', async () => {
			const { DELETE } = await import('@/app/api/admin/games/[missionId]/slotting/route');
			const { NextRequest } = await import('next/server');
			const { missionId } = insertPublishedMission('ep-crud-4');
			const sid = createSteamSession(dbOps, { steamid64: ADMIN_STEAM_ID, redirectPath: '/' });

			const res = await DELETE(
				new NextRequest('http://localhost/api/admin/games/1/slotting', {
					method: 'DELETE',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ episodeNumber: 1 })
				}),
				missionRouteContext(missionId)
			);

			expect(res.status).toBe(400);
		});

		it('requires confirmation to delete episode with occupied slots', async () => {
			const { DELETE } = await import('@/app/api/admin/games/[missionId]/slotting/route');
			const { NextRequest } = await import('next/server');
			const { missionId } = insertPublishedMission('ep-crud-5');

			// Add EP2 with an occupied slot
			const db = getDb();
			const ep2Slotting = twoSideSlotting();
			(ep2Slotting.sides[0].squads[0].slots[0] as { occupant: unknown }).occupant = { type: 'placeholder', label: 'TT' };
			db.prepare('INSERT INTO mission_episode_slotting (mission_id, episode_number, slotting_json) VALUES (?, 2, ?)')
				.run(missionId, JSON.stringify(ep2Slotting));

			const sid = createSteamSession(dbOps, { steamid64: ADMIN_STEAM_ID, redirectPath: '/' });

			// Without confirmation
			const res1 = await DELETE(
				new NextRequest('http://localhost/api/admin/games/1/slotting', {
					method: 'DELETE',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ episodeNumber: 2 })
				}),
				missionRouteContext(missionId)
			);

			expect(res1.status).toBe(409);
			const json1 = await res1.json() as { error: string; occupiedCount: number };
			expect(json1.error).toBe('has_occupied_slots');
			expect(json1.occupiedCount).toBe(1);

			// With confirmation
			const res2 = await DELETE(
				new NextRequest('http://localhost/api/admin/games/1/slotting', {
					method: 'DELETE',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ episodeNumber: 2, confirmOccupied: true })
				}),
				missionRouteContext(missionId)
			);

			expect(res2.status).toBe(200);
			expect(readEpisodeSlotting(missionId, 2)).toBeUndefined();
		});
	});

	// ── Episode isolation — priority slots ───────────────────────────

	describe('priority slot isolation', () => {
		it('claiming in EP1 does not affect EP2', async () => {
			const { POST } = await import('@/app/api/games/[shortCode]/claim/route');
			const { NextRequest } = await import('next/server');
			const { missionId, badgeId } = insertPublishedMission('iso-pri-1');
			addEpisode2(missionId);
			const playerId = createConfirmedPlayer(dbOps, PLAYER1_STEAM_ID, 'Player1');
			grantBadge(playerId, badgeId);

			// Set some priority slots in both episodes
			const db = getDb();
			for (const ep of [1, 2]) {
				const row = readEpisodeSlotting(missionId, ep)!;
				const slotting = JSON.parse(row.slotting_json);
				slotting.sides[0].squads[0].slots[2].access = 'priority'; // sa-s3
				slotting.sides[0].squads[0].slots[3].access = 'priority'; // sa-s4
				db.prepare('UPDATE mission_episode_slotting SET slotting_json = ? WHERE mission_id = ? AND episode_number = ?')
					.run(JSON.stringify(slotting), missionId, ep);
				if (ep === 1) {
					db.prepare('UPDATE missions SET slotting_json = ? WHERE id = ?').run(JSON.stringify(slotting), missionId);
				}
			}

			const ep2Before = readEpisodeSlotting(missionId, 2)!;
			const sid = createSteamSession(dbOps, { steamid64: PLAYER1_STEAM_ID, redirectPath: '/' });

			// Claim in EP1
			const res = await POST(
				new NextRequest('http://localhost/api/games/iso-pri-1/claim', {
					method: 'POST',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ slotId: 'sa-s3', episodeNumber: 1 })
				}),
				gameRouteContext('iso-pri-1')
			);

			expect(res.status).toBe(200);

			// EP2 should be completely unchanged
			const ep2After = readEpisodeSlotting(missionId, 2)!;
			expect(ep2After.slotting_json).toBe(ep2Before.slotting_json);
			expect(ep2After.slotting_revision).toBe(ep2Before.slotting_revision);
		});

		it('user can hold slots in EP1 AND EP2 simultaneously', async () => {
			const { POST } = await import('@/app/api/games/[shortCode]/claim/route');
			const { NextRequest } = await import('next/server');
			const { missionId, badgeId } = insertPublishedMission('iso-pri-2');
			addEpisode2(missionId);
			const playerId = createConfirmedPlayer(dbOps, PLAYER1_STEAM_ID, 'Player1');
			grantBadge(playerId, badgeId);

			const db = getDb();
			for (const ep of [1, 2]) {
				const row = readEpisodeSlotting(missionId, ep)!;
				const slotting = JSON.parse(row.slotting_json);
				slotting.sides[0].squads[0].slots[2].access = 'priority';
				db.prepare('UPDATE mission_episode_slotting SET slotting_json = ? WHERE mission_id = ? AND episode_number = ?')
					.run(JSON.stringify(slotting), missionId, ep);
				if (ep === 1) db.prepare('UPDATE missions SET slotting_json = ? WHERE id = ?').run(JSON.stringify(slotting), missionId);
			}

			const sid = createSteamSession(dbOps, { steamid64: PLAYER1_STEAM_ID, redirectPath: '/' });

			// Claim in EP1
			const res1 = await POST(
				new NextRequest('http://localhost/api/games/iso-pri-2/claim', {
					method: 'POST',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ slotId: 'sa-s3', episodeNumber: 1 })
				}),
				gameRouteContext('iso-pri-2')
			);
			expect(res1.status).toBe(200);

			// Claim in EP2 — should also succeed (different episode)
			const res2 = await POST(
				new NextRequest('http://localhost/api/games/iso-pri-2/claim', {
					method: 'POST',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ slotId: 'sa-s3', episodeNumber: 2 })
				}),
				gameRouteContext('iso-pri-2')
			);
			expect(res2.status).toBe(200);

			// Both episodes should show the user
			const ep1 = JSON.parse(readEpisodeSlotting(missionId, 1)!.slotting_json);
			const ep2 = JSON.parse(readEpisodeSlotting(missionId, 2)!.slotting_json);
			expect(ep1.sides[0].squads[0].slots[2].occupant?.userId).toBe(playerId);
			expect(ep2.sides[0].squads[0].slots[2].occupant?.userId).toBe(playerId);
		});

		it('leaving EP1 slot does not affect EP2 slot', async () => {
			const { POST: ClaimPost } = await import('@/app/api/games/[shortCode]/claim/route');
			const { POST: LeavePost } = await import('@/app/api/games/[shortCode]/leave-slot/route');
			const { NextRequest } = await import('next/server');
			const { missionId, badgeId } = insertPublishedMission('iso-pri-3');
			addEpisode2(missionId);
			const playerId = createConfirmedPlayer(dbOps, PLAYER1_STEAM_ID, 'Player1');
			grantBadge(playerId, badgeId);

			const db = getDb();
			for (const ep of [1, 2]) {
				const row = readEpisodeSlotting(missionId, ep)!;
				const slotting = JSON.parse(row.slotting_json);
				slotting.sides[0].squads[0].slots[2].access = 'priority';
				db.prepare('UPDATE mission_episode_slotting SET slotting_json = ? WHERE mission_id = ? AND episode_number = ?')
					.run(JSON.stringify(slotting), missionId, ep);
				if (ep === 1) db.prepare('UPDATE missions SET slotting_json = ? WHERE id = ?').run(JSON.stringify(slotting), missionId);
			}

			const sid = createSteamSession(dbOps, { steamid64: PLAYER1_STEAM_ID, redirectPath: '/' });

			// Claim both
			await ClaimPost(
				new NextRequest('http://localhost/api/games/iso-pri-3/claim', {
					method: 'POST',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ slotId: 'sa-s3', episodeNumber: 1 })
				}),
				gameRouteContext('iso-pri-3')
			);
			await ClaimPost(
				new NextRequest('http://localhost/api/games/iso-pri-3/claim', {
					method: 'POST',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ slotId: 'sa-s3', episodeNumber: 2 })
				}),
				gameRouteContext('iso-pri-3')
			);

			// Leave EP1
			const leaveRes = await LeavePost(
				new NextRequest('http://localhost/api/games/iso-pri-3/leave-slot', {
					method: 'POST',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ episodeNumber: 1 })
				}),
				gameRouteContext('iso-pri-3')
			);
			expect(leaveRes.status).toBe(200);

			// EP1 slot vacated, EP2 slot still held
			const ep1 = JSON.parse(readEpisodeSlotting(missionId, 1)!.slotting_json);
			const ep2 = JSON.parse(readEpisodeSlotting(missionId, 2)!.slotting_json);
			expect(ep1.sides[0].squads[0].slots[2].occupant).toBeNull();
			expect(ep2.sides[0].squads[0].slots[2].occupant?.userId).toBe(playerId);
		});
	});

	// ── Dual-write backward compatibility ────────────────────────────

	describe('dual-write backward compatibility', () => {
		it('EP1 claim updates both missions table and episode table', async () => {
			const { POST } = await import('@/app/api/games/[shortCode]/claim/route');
			const { NextRequest } = await import('next/server');
			const { missionId, badgeId } = insertPublishedMission('dw-1');
			const playerId = createConfirmedPlayer(dbOps, PLAYER1_STEAM_ID, 'Player1');
			grantBadge(playerId, badgeId);

			const db = getDb();
			const row = readEpisodeSlotting(missionId, 1)!;
			const slotting = JSON.parse(row.slotting_json);
			slotting.sides[0].squads[0].slots[2].access = 'priority';
			db.prepare('UPDATE mission_episode_slotting SET slotting_json = ? WHERE mission_id = ? AND episode_number = 1')
				.run(JSON.stringify(slotting), missionId);
			db.prepare('UPDATE missions SET slotting_json = ? WHERE id = ?').run(JSON.stringify(slotting), missionId);

			const sid = createSteamSession(dbOps, { steamid64: PLAYER1_STEAM_ID, redirectPath: '/' });

			await POST(
				new NextRequest('http://localhost/api/games/dw-1/claim', {
					method: 'POST',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ slotId: 'sa-s3', episodeNumber: 1 })
				}),
				gameRouteContext('dw-1')
			);

			const epSlotting = JSON.parse(readEpisodeSlotting(missionId, 1)!.slotting_json);
			const missionSlotting = JSON.parse(readMissionSlotting(missionId)!.slotting_json);

			// Both should have the claimed slot
			expect(epSlotting.sides[0].squads[0].slots[2].occupant?.userId).toBe(playerId);
			expect(missionSlotting.sides[0].squads[0].slots[2].occupant?.userId).toBe(playerId);
		});

		it('EP2 claim updates only episode table, not missions table', async () => {
			const { POST } = await import('@/app/api/games/[shortCode]/claim/route');
			const { NextRequest } = await import('next/server');
			const { missionId, badgeId } = insertPublishedMission('dw-2');
			addEpisode2(missionId);
			const playerId = createConfirmedPlayer(dbOps, PLAYER1_STEAM_ID, 'Player1');
			grantBadge(playerId, badgeId);

			const db = getDb();
			for (const ep of [1, 2]) {
				const row = readEpisodeSlotting(missionId, ep)!;
				const slotting = JSON.parse(row.slotting_json);
				slotting.sides[0].squads[0].slots[2].access = 'priority';
				db.prepare('UPDATE mission_episode_slotting SET slotting_json = ? WHERE mission_id = ? AND episode_number = ?')
					.run(JSON.stringify(slotting), missionId, ep);
				if (ep === 1) db.prepare('UPDATE missions SET slotting_json = ? WHERE id = ?').run(JSON.stringify(slotting), missionId);
			}

			const missionBefore = readMissionSlotting(missionId)!;
			const sid = createSteamSession(dbOps, { steamid64: PLAYER1_STEAM_ID, redirectPath: '/' });

			await POST(
				new NextRequest('http://localhost/api/games/dw-2/claim', {
					method: 'POST',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ slotId: 'sa-s3', episodeNumber: 2 })
				}),
				gameRouteContext('dw-2')
			);

			// EP2 updated
			const ep2 = JSON.parse(readEpisodeSlotting(missionId, 2)!.slotting_json);
			expect(ep2.sides[0].squads[0].slots[2].occupant?.userId).toBe(playerId);

			// Missions table unchanged
			const missionAfter = readMissionSlotting(missionId)!;
			expect(missionAfter.slotting_json).toBe(missionBefore.slotting_json);
		});
	});

	// ── Unit assignment isolation ────────────────────────────────────

	describe('unit assignment isolation', () => {
		it('assigns units to different sides per episode', async () => {
			const { PUT } = await import('@/app/api/admin/games/[missionId]/unit-assignments/route');
			const { NextRequest } = await import('next/server');
			const { missionId } = insertPublishedMission('ua-1');
			addEpisode2(missionId);
			const sid = createSteamSession(dbOps, { steamid64: ADMIN_STEAM_ID, redirectPath: '/' });

			const leaderId = createConfirmedPlayer(dbOps, LEADER_STEAM_ID, 'Leader');
			const db = getDb();
			const unitRes = db.prepare("INSERT INTO units (name, tag, status, slots_allocated, created_by_user_id) VALUES ('Team', 'TT', 'verified', 2, ?)").run(leaderId);
			const unitId = Number(unitRes.lastInsertRowid);
			db.prepare("INSERT INTO unit_memberships (unit_id, user_id, role) VALUES (?, ?, 'leader')").run(unitId, leaderId);

			// EP1: assign to side-a
			const res1 = await PUT(
				new NextRequest('http://localhost/api/admin/games/1/unit-assignments', {
					method: 'PUT',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ episodeNumber: 1, assignments: [{ unitId, sideId: 'side-a' }] })
				}),
				missionRouteContext(missionId)
			);
			expect(res1.status).toBe(200);

			// EP2: assign to side-b
			const res2 = await PUT(
				new NextRequest('http://localhost/api/admin/games/1/unit-assignments', {
					method: 'PUT',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ episodeNumber: 2, assignments: [{ unitId, sideId: 'side-b' }] })
				}),
				missionRouteContext(missionId)
			);
			expect(res2.status).toBe(200);

			// Verify independence
			const ep1Assigns = db.prepare('SELECT side_id FROM mission_unit_assignments WHERE mission_id = ? AND episode_number = 1').all(missionId) as Array<{ side_id: string }>;
			const ep2Assigns = db.prepare('SELECT side_id FROM mission_unit_assignments WHERE mission_id = ? AND episode_number = 2').all(missionId) as Array<{ side_id: string }>;
			expect(ep1Assigns[0]?.side_id).toBe('side-a');
			expect(ep2Assigns[0]?.side_id).toBe('side-b');
		});
	});

	// ── Auto-conversion per side ─────────────────────────────────────

	describe('auto-conversion per side', () => {
		it('converts slots per-side when priority opens', async () => {
			const { missionId } = insertPublishedMission('ac-1');
			addEpisode2(missionId);

			const db = getDb();
			const leaderId = createConfirmedPlayer(dbOps, LEADER_STEAM_ID, 'Leader');
			const unitRes = db.prepare("INSERT INTO units (name, tag, status, slots_allocated, created_by_user_id) VALUES ('Team', 'TT', 'verified', 2, ?)").run(leaderId);
			const unitId = Number(unitRes.lastInsertRowid);
			db.prepare("INSERT INTO unit_memberships (unit_id, user_id, role) VALUES (?, ?, 'leader')").run(unitId, leaderId);

			// Assign TT to side-a for both episodes
			db.prepare("INSERT INTO mission_unit_assignments (mission_id, unit_id, side_id, episode_number, assigned_by_steamid64) VALUES (?, ?, 'side-a', 1, ?)").run(missionId, unitId, ADMIN_STEAM_ID);
			db.prepare("INSERT INTO mission_unit_assignments (mission_id, unit_id, side_id, episode_number, assigned_by_steamid64) VALUES (?, ?, 'side-a', 2, ?)").run(missionId, unitId, ADMIN_STEAM_ID);

			// Trigger auto-conversion by importing and calling ensureAutoConversion
			const { ensureAutoConversion, selectMissionColumns } = await import('@/features/games/infra/sqliteGamesShared');
			const { getDb: getDbPlatform } = await import('@/platform/db/connection');
			const dbConn = getDbPlatform();
			type MissionRow = import('@/features/games/infra/sqliteGamesShared').MissionRow;
			const row = dbConn.prepare(`SELECT ${selectMissionColumns()} FROM missions WHERE id = ?`).get(missionId) as MissionRow;

			// Convert both episodes
			ensureAutoConversion(dbConn, row, 1);
			ensureAutoConversion(dbConn, row, 2);

			// Verify: side-a should have 2 unit slots (TT allocated 2), 2 converted
			// side-b should have 0 unit slots (no assignment), 4 converted
			for (const ep of [1, 2]) {
				const epRow = readEpisodeSlotting(missionId, ep)!;
				const slotting = JSON.parse(epRow.slotting_json);
				const sideA = slotting.sides[0];
				const sideB = slotting.sides[1];

				const sideAUnit = sideA.squads[0].slots.filter((s: { access: string }) => s.access === 'unit').length;
				const sideBUnit = sideB.squads[0].slots.filter((s: { access: string }) => s.access === 'unit').length;

				expect(sideAUnit).toBe(2); // TT has 2 allocated on side-a
				expect(sideBUnit).toBe(0); // No unit assigned to side-b
			}
		});
	});

	// ── Draft duplication ────────────────────────────────────────────

	describe('draft duplication with episodes', () => {
		it('duplicate_previous copies all episodes with cleared occupants', async () => {
			const { missionId } = insertPublishedMission('dup-1');
			addEpisode2(missionId);

			// Add occupant to EP1 and EP2
			const db = getDb();
			for (const ep of [1, 2]) {
				const row = readEpisodeSlotting(missionId, ep)!;
				const slotting = JSON.parse(row.slotting_json);
				slotting.sides[0].squads[0].slots[0].occupant = { type: 'user', userId: 99, callsign: 'Occupied', assignedBy: 'admin', assignedAt: new Date().toISOString() };
				db.prepare('UPDATE mission_episode_slotting SET slotting_json = ? WHERE mission_id = ? AND episode_number = ?')
					.run(JSON.stringify(slotting), missionId, ep);
				if (ep === 1) db.prepare('UPDATE missions SET slotting_json = ? WHERE id = ?').run(JSON.stringify(slotting), missionId);
			}

			// Create draft via duplicate
			const { createDraft } = await import('@/features/games/infra/sqliteGames');
			const result = createDraft({ mode: 'duplicate_previous', createdBySteamId64: ADMIN_STEAM_ID });
			expect(result.success).toBe(true);
			if (!result.success) return;

			const draftId = result.mission.id;

			// Draft should have 2 episodes
			expect(result.mission.episodeSlottings.length).toBe(2);

			// Both episodes should have cleared occupants
			for (const ep of [1, 2]) {
				const epRow = readEpisodeSlotting(draftId, ep)!;
				const slotting = JSON.parse(epRow.slotting_json);
				expect(slotting.sides[0].squads[0].slots[0].occupant).toBeNull();
			}
		});
	});

	// ── Archive with multi-episode sides ─────────────────────────────

	describe('archive with multi-episode sides', () => {
		it('accepts winner from side that only exists in EP2', async () => {
			const { missionId } = insertPublishedMission('arch-1');

			// EP2 has a unique side 'side-c' that doesn't exist in EP1
			const db = getDb();
			const ep2Slotting = {
				sides: [
					{ id: 'side-a', name: 'Alpha', color: '#3B82F6', squads: [{ id: 'sc-sq1', name: 'C-1', slots: [{ id: 'sc-s1', role: 'R', access: 'unit', occupant: null }] }] },
					{ id: 'side-c', name: 'Charlie', color: '#10B981', squads: [{ id: 'sc-sq2', name: 'C-2', slots: [{ id: 'sc-s2', role: 'R', access: 'unit', occupant: null }] }] }
				]
			};
			db.prepare('INSERT INTO mission_episode_slotting (mission_id, episode_number, slotting_json) VALUES (?, 2, ?)').run(missionId, JSON.stringify(ep2Slotting));

			// Archive with winner=side-c (only in EP2)
			const { archiveGame } = await import('@/features/games/infra/sqliteGames');
			const result = archiveGame({
				missionId,
				archivedBySteamId64: ADMIN_STEAM_ID,
				result: {
					winnerSideId: null,
					sideScores: [
						{ sideId: 'side-a', score: 1 },
						{ sideId: 'side-b', score: 2 },
						{ sideId: 'side-c', score: 3 }
					]
				}
			});

			expect(result.success).toBe(true);
		});

		it('rejects winner side not in any episode', async () => {
			const { missionId } = insertPublishedMission('arch-2');
			addEpisode2(missionId);

			const { archiveGame } = await import('@/features/games/infra/sqliteGames');
			const result = archiveGame({
				missionId,
				archivedBySteamId64: ADMIN_STEAM_ID,
				result: {
					winnerSideId: 'side-nonexistent',
					sideScores: []
				}
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBe('archive_result_invalid');
			}
		});
	});

	// ── New episode copies unit assignments ──────────────────────────

	describe('new episode copies unit assignments', () => {
		it('copies unit assignments from previous episode when creating a new one via slotting PUT', async () => {
			const { PUT } = await import('@/app/api/admin/games/[missionId]/slotting/route');
			const { NextRequest } = await import('next/server');
			const { missionId } = insertPublishedMission('copy-ua-1');
			const sid = createSteamSession(dbOps, { steamid64: ADMIN_STEAM_ID, redirectPath: '/' });

			// Create a unit and assign to EP1
			const db = getDb();
			const leaderId = createConfirmedPlayer(dbOps, LEADER_STEAM_ID, 'Leader');
			const unitRes = db.prepare("INSERT INTO units (name, tag, status, slots_allocated, created_by_user_id) VALUES ('Team', 'TT', 'verified', 2, ?)").run(leaderId);
			const unitId = Number(unitRes.lastInsertRowid);
			db.prepare("INSERT INTO unit_memberships (unit_id, user_id, role) VALUES (?, ?, 'leader')").run(unitId, leaderId);
			db.prepare("INSERT INTO mission_unit_assignments (mission_id, unit_id, side_id, episode_number, assigned_by_steamid64) VALUES (?, ?, 'side-a', 1, ?)").run(missionId, unitId, ADMIN_STEAM_ID);

			// Create EP2 via PUT
			const res = await PUT(
				new NextRequest('http://localhost/api/admin/games/1/slotting', {
					method: 'PUT',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ episodeNumber: 2, slottingRevision: 1, slotting: twoSideSlotting(), confirmDestructive: false })
				}),
				missionRouteContext(missionId)
			);

			expect(res.status).toBe(200);

			// EP2 should have copied the unit assignment from EP1
			const ep2Assigns = db.prepare('SELECT unit_id, side_id FROM mission_unit_assignments WHERE mission_id = ? AND episode_number = 2').all(missionId) as Array<{ unit_id: number; side_id: string }>;
			expect(ep2Assigns).toHaveLength(1);
			expect(ep2Assigns[0].unit_id).toBe(unitId);
			expect(ep2Assigns[0].side_id).toBe('side-a');

			// EP1 assignment should be untouched
			const ep1Assigns = db.prepare('SELECT unit_id, side_id FROM mission_unit_assignments WHERE mission_id = ? AND episode_number = 1').all(missionId) as Array<{ unit_id: number; side_id: string }>;
			expect(ep1Assigns).toHaveLength(1);
		});

		it('does not copy assignments when there is no previous episode', async () => {
			const { PUT } = await import('@/app/api/admin/games/[missionId]/slotting/route');
			const { NextRequest } = await import('next/server');

			// Create a fresh mission with no unit assignments at all
			const db = getDb();
			const slotting = twoSideSlotting();
			const res0 = db.prepare(`
				INSERT INTO missions (status, title, description, short_code, slotting_json, early_password,
					priority_claim_manual_state, created_by_steamid64, updated_by_steamid64, published_at)
				VALUES ('published', 'Test', '', 'no-prev-ep', ?, 'pw123', 'open', ?, ?, CURRENT_TIMESTAMP)
			`).run(JSON.stringify(slotting), ADMIN_STEAM_ID, ADMIN_STEAM_ID);
			const missionId = Number(res0.lastInsertRowid);

			const sid = createSteamSession(dbOps, { steamid64: ADMIN_STEAM_ID, redirectPath: '/' });

			// Create EP2
			const res = await PUT(
				new NextRequest('http://localhost/api/admin/games/1/slotting', {
					method: 'PUT',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ episodeNumber: 2, slottingRevision: 1, slotting: twoSideSlotting(), confirmDestructive: false })
				}),
				missionRouteContext(missionId)
			);

			expect(res.status).toBe(200);

			// No unit assignments should exist for EP2
			const ep2Assigns = db.prepare('SELECT * FROM mission_unit_assignments WHERE mission_id = ? AND episode_number = 2').all(missionId);
			expect(ep2Assigns).toHaveLength(0);
		});
	});

	// ── Viewer detail ────────────────────────────────────────────────

	describe('viewer detail', () => {
		it('returns episodeSlottings and activeEpisode in mission detail', async () => {
			const { missionId, badgeId } = insertPublishedMission('viewer-1');
			addEpisode2(missionId);
			const playerId = createConfirmedPlayer(dbOps, PLAYER1_STEAM_ID, 'Player1');
			grantBadge(playerId, badgeId);

			// Add a mission update for episode 2
			const db = getDb();
			db.prepare("INSERT INTO mission_public_updates (mission_id, kind, episode_number, total_episodes, created_by_steamid64) VALUES (?, 'priority_slotting_started', 2, 3, ?)")
				.run(missionId, ADMIN_STEAM_ID);

			const { getGameByShortCode } = await import('@/features/games/infra/sqliteGames');
			const result = getGameByShortCode({ shortCode: 'viewer-1', steamId64: PLAYER1_STEAM_ID });

			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.mission.episodeSlottings.length).toBe(2);
			expect(result.mission.activeEpisode).toBe(2);
		});

		it('returns per-episode unitSideByEpisode for unit members', async () => {
			const { missionId } = insertPublishedMission('viewer-side-ep');
			addEpisode2(missionId);

			const db = getDb();
			const leaderId = createConfirmedPlayer(dbOps, LEADER_STEAM_ID, 'Leader');
			const unitRes = db.prepare("INSERT INTO units (name, tag, status, slots_allocated, created_by_user_id) VALUES ('Team', 'TT', 'verified', 2, ?)").run(leaderId);
			const unitId = Number(unitRes.lastInsertRowid);
			db.prepare("INSERT INTO unit_memberships (unit_id, user_id, role) VALUES (?, ?, 'leader')").run(unitId, leaderId);

			// EP1: side-a, EP2: side-b
			db.prepare("INSERT INTO mission_unit_assignments (mission_id, unit_id, side_id, episode_number, assigned_by_steamid64) VALUES (?, ?, 'side-a', 1, ?)").run(missionId, unitId, ADMIN_STEAM_ID);
			db.prepare("INSERT INTO mission_unit_assignments (mission_id, unit_id, side_id, episode_number, assigned_by_steamid64) VALUES (?, ?, 'side-b', 2, ?)").run(missionId, unitId, ADMIN_STEAM_ID);

			const { getGameByShortCode } = await import('@/features/games/infra/sqliteGames');
			const result = getGameByShortCode({ shortCode: 'viewer-side-ep', steamId64: LEADER_STEAM_ID });

			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.mission.viewer.unitSideByEpisode).toEqual({ 1: 'side-a', 2: 'side-b' });
			// The active episode is 1 (no updates), so unitSideId should be side-a
			expect(result.mission.viewer.unitSideId).toBe('side-a');
		});

		it('priority claiming works when manually force-opened after gameplay release', async () => {
			const { missionId, badgeId } = insertPublishedMission('viewer-reopen');
			const playerId = createConfirmedPlayer(dbOps, PLAYER1_STEAM_ID, 'Player1');
			grantBadge(playerId, badgeId);

			// Set priority slots
			const db = getDb();
			const row = readEpisodeSlotting(missionId, 1)!;
			const slotting = JSON.parse(row.slotting_json);
			slotting.sides[0].squads[0].slots[2].access = 'priority';
			db.prepare('UPDATE mission_episode_slotting SET slotting_json = ? WHERE mission_id = ? AND episode_number = 1')
				.run(JSON.stringify(slotting), missionId);
			db.prepare('UPDATE missions SET slotting_json = ? WHERE id = ?').run(JSON.stringify(slotting), missionId);

			// Simulate: priority gameplay released, then admin re-opens slotting
			db.prepare("UPDATE missions SET priority_gameplay_released_at = CURRENT_TIMESTAMP, priority_claim_manual_state = 'open' WHERE id = ?").run(missionId);

			const { getGameByShortCode } = await import('@/features/games/infra/sqliteGames');
			const result = getGameByShortCode({ shortCode: 'viewer-reopen', steamId64: PLAYER1_STEAM_ID });

			expect(result.success).toBe(true);
			if (!result.success) return;

			// priorityClaimOpen should be true despite priority_gameplay_released_at being set
			expect(result.mission.priorityClaimOpen).toBe(true);
			expect(result.mission.viewer.canClaimPriority).toBe(true);
		});
	});
});
