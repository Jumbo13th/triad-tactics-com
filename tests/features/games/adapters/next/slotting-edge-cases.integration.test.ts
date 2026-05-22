import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb, type DbOperations } from '../../../../fixtures/dbOperations';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';
import { buildTestApplicationRecord } from '../../../../fixtures/application';

const ADMIN_STEAM_ID = '76561198099990001';
const LEADER_A_STEAM_ID = '76561198099990002';
const LEADER_B_STEAM_ID = '76561198099990003';
const MEMBER_STEAM_ID = '76561198099990004';
const PLAYER_NO_UNIT_STEAM_ID = '76561198099990005';

function gameRouteContext(shortCode: string) {
	return { params: Promise.resolve({ shortCode }) };
}

function missionRouteContext(missionId: number | string) {
	return { params: Promise.resolve({ missionId: String(missionId) }) };
}

function createConfirmedPlayer(dbOps: DbOperations, steamId64: string, callsign: string): number {
	const inserted = dbOps.insertApplication(
		buildTestApplicationRecord({ email: `${callsign}-${Date.now()}@test.com`, steamid64: steamId64, callsign })
	);
	if (!inserted.success) throw new Error('insert application failed');
	const confirmed = dbOps.confirmApplication(Number(inserted.id), ADMIN_STEAM_ID);
	if (!confirmed.success) throw new Error('confirm application failed');
	const user = dbOps.getUserBySteamId64(steamId64);
	if (!user?.id) throw new Error('user not found after confirm');
	dbOps.setArmaGuidByUserId({ userId: user.id, armaGuid: `test-guid-${steamId64}` });
	return user.id;
}

function createAllUnitSlotting() {
	return {
		sides: [
			{
				id: 'side-us', name: 'US', displayName: 'US Army', color: '#3B82F6',
				squads: [
					{
						id: 'us-squad-1', name: 'Alpha',
						slots: [
							{ id: 'us-a-1', role: 'Squad Leader', access: 'unit', occupant: null },
							{ id: 'us-a-2', role: 'Rifleman', access: 'unit', occupant: null },
							{ id: 'us-a-3', role: 'Medic', access: 'unit', occupant: null },
							{ id: 'us-a-4', role: 'Grenadier', access: 'unit', occupant: null },
							{ id: 'us-a-5', role: 'MG', access: 'unit', occupant: null }
						]
					},
					{
						id: 'us-squad-2', name: 'Bravo',
						slots: [
							{ id: 'us-b-1', role: 'Squad Leader', access: 'unit', occupant: null },
							{ id: 'us-b-2', role: 'Rifleman', access: 'unit', occupant: null },
							{ id: 'us-b-3', role: 'Medic', access: 'unit', occupant: null }
						]
					}
				]
			},
			{
				id: 'side-ru', name: 'RU', color: '#EF4444',
				squads: [
					{
						id: 'ru-squad-1', name: 'Charlie',
						slots: [
							{ id: 'ru-c-1', role: 'Squad Leader', access: 'unit', occupant: null },
							{ id: 'ru-c-2', role: 'Rifleman', access: 'unit', occupant: null }
						]
					}
				]
			}
		]
	};
}

/**
 * Set up a published mission with two units (A and B) on different sides.
 * Unit A: 3 slots allocated, side-us, leader: LEADER_A
 * Unit B: 2 slots allocated, side-ru, leader: LEADER_B
 * Total slots: 10, total allocated: 5 → auto-conversion should produce 5 non-unit on priority open
 */
function setupTwoUnitMission(dbOps: DbOperations) {
	const db = getDb();
	const slotting = createAllUnitSlotting();

	const missionResult = db.prepare(`
		INSERT INTO missions (status, title, description, short_code, slotting_json, early_password, final_password,
			created_by_steamid64, updated_by_steamid64, unit_slotting_manual_state)
		VALUES ('published', 'Edge Case Mission', '', 'edge-test', ?, 'early-pw', 'final-pw', ?, ?, 'open')
	`).run(JSON.stringify(slotting), ADMIN_STEAM_ID, ADMIN_STEAM_ID);
	const missionId = Number(missionResult.lastInsertRowid);

	const leaderAId = createConfirmedPlayer(dbOps, LEADER_A_STEAM_ID, 'LeaderA');
	const leaderBId = createConfirmedPlayer(dbOps, LEADER_B_STEAM_ID, 'LeaderB');
	const memberId = createConfirmedPlayer(dbOps, MEMBER_STEAM_ID, 'MemberX');
	createConfirmedPlayer(dbOps, PLAYER_NO_UNIT_STEAM_ID, 'NoUnit');

	// Unit A: tag=ALFA, 3 slots
	const unitAResult = db.prepare(`
		INSERT INTO units (name, tag, status, leader_user_id, slots_allocated, created_by_user_id)
		VALUES ('Team Alpha', 'ALFA', 'verified', ?, 3, ?)
	`).run(leaderAId, leaderAId);
	const unitAId = Number(unitAResult.lastInsertRowid);
	db.prepare("INSERT INTO unit_memberships (unit_id, user_id, role) VALUES (?, ?, 'member')").run(unitAId, leaderAId);
	db.prepare("INSERT INTO unit_memberships (unit_id, user_id, role) VALUES (?, ?, 'member')").run(unitAId, memberId);
	db.prepare("INSERT INTO mission_unit_assignments (mission_id, unit_id, side_id, assigned_by_steamid64) VALUES (?, ?, 'side-us', ?)").run(missionId, unitAId, ADMIN_STEAM_ID);

	// Unit B: tag=BRVO, 2 slots
	const unitBResult = db.prepare(`
		INSERT INTO units (name, tag, status, leader_user_id, slots_allocated, created_by_user_id)
		VALUES ('Team Bravo', 'BRVO', 'verified', ?, 2, ?)
	`).run(leaderBId, leaderBId);
	const unitBId = Number(unitBResult.lastInsertRowid);
	db.prepare("INSERT INTO unit_memberships (unit_id, user_id, role) VALUES (?, ?, 'member')").run(unitBId, leaderBId);
	db.prepare("INSERT INTO mission_unit_assignments (mission_id, unit_id, side_id, assigned_by_steamid64) VALUES (?, ?, 'side-ru', ?)").run(missionId, unitBId, ADMIN_STEAM_ID);

	return { missionId, unitAId, unitBId, leaderAId, leaderBId, memberId };
}

function getSlotting(shortCode: string) {
	const db = getDb();
	const row = db.prepare('SELECT slotting_json, slotting_revision FROM missions WHERE short_code = ?').get(shortCode) as { slotting_json: string; slotting_revision: number };
	return { slotting: JSON.parse(row.slotting_json), revision: row.slotting_revision };
}

function getAllSlots(slotting: { sides: Array<{ squads: Array<{ slots: Array<{ id: string; access: string; occupant: unknown }> }> }> }) {
	return slotting.sides.flatMap(s => s.squads.flatMap(sq => sq.slots));
}

describe('Slotting edge cases (integration)', () => {
	let dbOps: DbOperations;

	beforeAll(async () => {
		await setupIsolatedDb({ prefix: 'slotting-edge-cases', adminSteamIds: ADMIN_STEAM_ID });
	});

	beforeEach(async () => {
		const mod = await import('../../../../fixtures/dbOperations');
		dbOps = mod.dbOperations;
		dbOps.clearAll();
	});

	describe('two units claiming on different sides concurrently', () => {
		it('both leaders can claim slots on their assigned sides independently', async () => {
			const { POST } = await import('@/app/api/games/[shortCode]/claim-unit/route');
			const { NextRequest } = await import('next/server');
			setupTwoUnitMission(dbOps);

			const sidA = createSteamSession(dbOps, { steamid64: LEADER_A_STEAM_ID, redirectPath: '/' });
			const sidB = createSteamSession(dbOps, { steamid64: LEADER_B_STEAM_ID, redirectPath: '/' });
			const makeReq = (sid: string, slotId: string) => new NextRequest('http://localhost/api/games/edge-test/claim-unit', {
				method: 'POST',
				headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
				body: JSON.stringify({ slotId })
			});

			// Leader A claims on side-us
			const resA = await POST(makeReq(sidA, 'us-a-1'), gameRouteContext('edge-test'));
			expect(resA.status).toBe(200);

			// Leader B claims on side-ru
			const resB = await POST(makeReq(sidB, 'ru-c-1'), gameRouteContext('edge-test'));
			expect(resB.status).toBe(200);

			const { slotting } = getSlotting('edge-test');
			expect(slotting.sides[0].squads[0].slots[0].occupant).toEqual({ type: 'placeholder', label: 'ALFA' });
			expect(slotting.sides[1].squads[0].slots[0].occupant).toEqual({ type: 'placeholder', label: 'BRVO' });
		});

		it('leader cannot claim on the other units assigned side', async () => {
			const { POST } = await import('@/app/api/games/[shortCode]/claim-unit/route');
			const { NextRequest } = await import('next/server');
			setupTwoUnitMission(dbOps);

			const sidA = createSteamSession(dbOps, { steamid64: LEADER_A_STEAM_ID, redirectPath: '/' });

			// Leader A tries side-ru slot (assigned to side-us)
			const res = await POST(
				new NextRequest('http://localhost/api/games/edge-test/claim-unit', {
					method: 'POST',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sidA}` },
					body: JSON.stringify({ slotId: 'ru-c-1' })
				}),
				gameRouteContext('edge-test')
			);
			expect(res.status).toBe(403);
			expect((await res.json()).error).toBe('wrong_side');
		});
	});

	describe('slots_allocated boundary', () => {
		it('leader can claim exactly up to slots_allocated and no more', async () => {
			const { POST } = await import('@/app/api/games/[shortCode]/claim-unit/route');
			const { NextRequest } = await import('next/server');
			setupTwoUnitMission(dbOps);

			const sid = createSteamSession(dbOps, { steamid64: LEADER_A_STEAM_ID, redirectPath: '/' });
			const headers = { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` };

			// ALFA has 3 slots allocated
			const res1 = await POST(new NextRequest('http://localhost/api/games/edge-test/claim-unit', { method: 'POST', headers, body: JSON.stringify({ slotId: 'us-a-1' }) }), gameRouteContext('edge-test'));
			expect(res1.status).toBe(200);

			const res2 = await POST(new NextRequest('http://localhost/api/games/edge-test/claim-unit', { method: 'POST', headers, body: JSON.stringify({ slotId: 'us-a-2' }) }), gameRouteContext('edge-test'));
			expect(res2.status).toBe(200);

			const res3 = await POST(new NextRequest('http://localhost/api/games/edge-test/claim-unit', { method: 'POST', headers, body: JSON.stringify({ slotId: 'us-a-3' }) }), gameRouteContext('edge-test'));
			expect(res3.status).toBe(200);

			// 4th slot should be rejected
			const res4 = await POST(new NextRequest('http://localhost/api/games/edge-test/claim-unit', { method: 'POST', headers, body: JSON.stringify({ slotId: 'us-a-4' }) }), gameRouteContext('edge-test'));
			expect(res4.status).toBe(409);
			expect((await res4.json()).error).toBe('slots_exhausted');
		});
	});

	describe('claim then release then re-claim', () => {
		it('leader can release a claimed slot and claim a different one', async () => {
			const claimRoute = await import('@/app/api/games/[shortCode]/claim-unit/route');
			const releaseRoute = await import('@/app/api/games/[shortCode]/release-unit/route');
			const { NextRequest } = await import('next/server');
			setupTwoUnitMission(dbOps);

			const sid = createSteamSession(dbOps, { steamid64: LEADER_A_STEAM_ID, redirectPath: '/' });
			const headers = { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` };

			// Claim slot 1
			await claimRoute.POST(new NextRequest('http://localhost/api/games/edge-test/claim-unit', { method: 'POST', headers, body: JSON.stringify({ slotId: 'us-a-1' }) }), gameRouteContext('edge-test'));

			// Release slot 1
			const releaseRes = await releaseRoute.POST(new NextRequest('http://localhost/api/games/edge-test/release-unit', { method: 'POST', headers, body: JSON.stringify({ slotId: 'us-a-1' }) }), gameRouteContext('edge-test'));
			expect(releaseRes.status).toBe(200);

			// Claim a different slot (us-b-1 — same side, different squad)
			const reclaimRes = await claimRoute.POST(new NextRequest('http://localhost/api/games/edge-test/claim-unit', { method: 'POST', headers, body: JSON.stringify({ slotId: 'us-b-1' }) }), gameRouteContext('edge-test'));
			expect(reclaimRes.status).toBe(200);

			const { slotting } = getSlotting('edge-test');
			// us-a-1 should be empty, us-b-1 should be claimed
			expect(slotting.sides[0].squads[0].slots[0].occupant).toBeNull();
			expect(slotting.sides[0].squads[1].slots[0].occupant).toEqual({ type: 'placeholder', label: 'ALFA' });
		});
	});

	describe('unit slotting closed after gameplay release', () => {
		it('releasing unit gameplay closes unit slotting', async () => {
			const claimRoute = await import('@/app/api/games/[shortCode]/claim-unit/route');
			const releaseGameplayRoute = await import('@/app/api/admin/games/[missionId]/release-unit/route');
			const { NextRequest } = await import('next/server');
			const { missionId } = setupTwoUnitMission(dbOps);

			const leaderSid = createSteamSession(dbOps, { steamid64: LEADER_A_STEAM_ID, redirectPath: '/' });
			const adminSid = createSteamSession(dbOps, { steamid64: ADMIN_STEAM_ID, redirectPath: '/en/admin/games' });

			// Leader claims a slot first
			const leaderHeaders = { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${leaderSid}` };
			await claimRoute.POST(new NextRequest('http://localhost/api/games/edge-test/claim-unit', { method: 'POST', headers: leaderHeaders, body: JSON.stringify({ slotId: 'us-a-1' }) }), gameRouteContext('edge-test'));

			// Admin releases unit gameplay
			const adminHeaders = { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${adminSid}` };
			const releaseRes = await releaseGameplayRoute.POST(
				new NextRequest(`http://localhost/api/admin/games/${missionId}/release-unit`, { method: 'POST', headers: adminHeaders }),
				missionRouteContext(missionId)
			);
			expect(releaseRes.status).toBe(200);

			// Trying to claim after unit gameplay released should fail
			const afterRes = await claimRoute.POST(new NextRequest('http://localhost/api/games/edge-test/claim-unit', { method: 'POST', headers: leaderHeaders, body: JSON.stringify({ slotId: 'us-a-2' }) }), gameRouteContext('edge-test'));
			expect(afterRes.status).toBe(409);
			expect((await afterRes.json()).error).toBe('unit_slotting_closed');
		});
	});

	describe('auto-conversion on priority open', () => {
		it('auto-converts unclaimed unit slots when priority is manually opened', async () => {
			const { missionId } = setupTwoUnitMission(dbOps);
			const db = getDb();

			// Leader A claims 2 out of 3 allocated slots
			const claimRoute = await import('@/app/api/games/[shortCode]/claim-unit/route');
			const { NextRequest } = await import('next/server');
			const leaderSid = createSteamSession(dbOps, { steamid64: LEADER_A_STEAM_ID, redirectPath: '/' });
			const leaderHeaders = { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${leaderSid}` };
			await claimRoute.POST(new NextRequest('http://localhost/api/games/edge-test/claim-unit', { method: 'POST', headers: leaderHeaders, body: JSON.stringify({ slotId: 'us-a-1' }) }), gameRouteContext('edge-test'));
			await claimRoute.POST(new NextRequest('http://localhost/api/games/edge-test/claim-unit', { method: 'POST', headers: leaderHeaders, body: JSON.stringify({ slotId: 'us-a-2' }) }), gameRouteContext('edge-test'));

			// Leader B claims 1 out of 2 allocated slots
			const leaderBSid = createSteamSession(dbOps, { steamid64: LEADER_B_STEAM_ID, redirectPath: '/' });
			const leaderBHeaders = { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${leaderBSid}` };
			await claimRoute.POST(new NextRequest('http://localhost/api/games/edge-test/claim-unit', { method: 'POST', headers: leaderBHeaders, body: JSON.stringify({ slotId: 'ru-c-1' }) }), gameRouteContext('edge-test'));

			// Now manually open priority (simulates admin action via settings update)
			// Total allocated: 5 (3+2), claimed: 3, total slots: 10
			// So 10-5 = 5 slots should become non-unit
			db.prepare("UPDATE missions SET priority_claim_manual_state = 'open' WHERE id = ?").run(missionId);

			// Trigger lazy auto-conversion by loading mission detail (getGameByShortCode)
			const { getGameByShortCode } = await import('@/features/games/infra/sqliteGames');
			const viewerSid = PLAYER_NO_UNIT_STEAM_ID;
			const result = getGameByShortCode({ shortCode: 'edge-test', steamId64: viewerSid });
			expect(result.success).toBe(true);

			if (!result.success) return;

			const allSlots = getAllSlots(result.mission.slotting);
			const unitSlots = allSlots.filter(s => s.access === 'unit');
			const prioritySlots = allSlots.filter(s => s.access === 'priority');
			const regularSlots = allSlots.filter(s => s.access === 'regular');

			// 5 allocated unit slots remain, 5 converted to non-unit
			expect(unitSlots.length).toBe(5);
			expect(prioritySlots.length + regularSlots.length).toBe(5);

			// All claimed slots must stay as 'unit'
			const claimedSlots = allSlots.filter(s => s.occupant !== null);
			for (const slot of claimedSlots) {
				expect(slot.access).toBe('unit');
			}
		});

		it('auto-conversion is idempotent — running twice produces no additional changes', async () => {
			const { missionId } = setupTwoUnitMission(dbOps);
			const db = getDb();

			db.prepare("UPDATE missions SET priority_claim_manual_state = 'open' WHERE id = ?").run(missionId);

			const { getGameByShortCode } = await import('@/features/games/infra/sqliteGames');

			// First call triggers auto-conversion
			const result1 = getGameByShortCode({ shortCode: 'edge-test', steamId64: PLAYER_NO_UNIT_STEAM_ID });
			expect(result1.success).toBe(true);
			if (!result1.success) return;
			const rev1 = result1.mission.slottingRevision;

			// Second call should NOT change revision (no changes needed)
			const result2 = getGameByShortCode({ shortCode: 'edge-test', steamId64: PLAYER_NO_UNIT_STEAM_ID });
			expect(result2.success).toBe(true);
			if (!result2.success) return;
			expect(result2.mission.slottingRevision).toBe(rev1);
		});
	});

	describe('auto-conversion with all slots claimed', () => {
		it('produces no non-unit slots when all slots are claimed by units', async () => {
			const { autoConvertUnclaimedSlots } = await import('@/features/games/domain/slotting');

			// 4 slots total, 4 allocated, all claimed
			const slotting = {
				sides: [{ id: 's1', name: 'US', color: '#000', squads: [{ id: 'sq1', name: 'A', slots: [
					{ id: 'a1', role: 'L', access: 'unit' as const, occupant: { type: 'placeholder' as const, label: 'TT' } },
					{ id: 'a2', role: 'R', access: 'unit' as const, occupant: { type: 'placeholder' as const, label: 'TT' } },
					{ id: 'a3', role: 'M', access: 'unit' as const, occupant: { type: 'placeholder' as const, label: 'BB' } },
					{ id: 'a4', role: 'G', access: 'unit' as const, occupant: { type: 'placeholder' as const, label: 'BB' } }
				] }] }]
			};

			const result = autoConvertUnclaimedSlots(slotting, new Map([['s1', 4]]));
			// All 4 allocated, all claimed → no changes needed
			expect(result).toBeNull();
		});
	});

	describe('auto-conversion with zero allocated', () => {
		it('ensureAutoConversion does nothing when no units are assigned', async () => {
			const db = getDb();

			const missionResult = db.prepare(`
				INSERT INTO missions (status, title, description, short_code, slotting_json, early_password, final_password,
					created_by_steamid64, updated_by_steamid64)
				VALUES ('published', 'No Units Mission', '', 'no-units', ?, 'pw1', 'pw2', ?, ?)
			`).run(JSON.stringify(createAllUnitSlotting()), ADMIN_STEAM_ID, ADMIN_STEAM_ID);
			const missionId = Number(missionResult.lastInsertRowid);

			createConfirmedPlayer(dbOps, PLAYER_NO_UNIT_STEAM_ID, 'Solo');
			db.prepare("UPDATE missions SET priority_claim_manual_state = 'open' WHERE id = ?").run(missionId);

			const { getGameByShortCode } = await import('@/features/games/infra/sqliteGames');
			const result = getGameByShortCode({ shortCode: 'no-units', steamId64: PLAYER_NO_UNIT_STEAM_ID });
			expect(result.success).toBe(true);
			if (!result.success) return;

			// All slots should remain as unit since no units are assigned (no conversion happens)
			const allSlots = getAllSlots(result.mission.slotting);
			const nonUnit = allSlots.filter(s => s.access !== 'unit');
			expect(nonUnit.length).toBe(0);
		});
	});

	describe('auto-conversion ratio', () => {
		it('correctly splits non-unit slots ~2:1 priority:regular', async () => {
			const { autoConvertUnclaimedSlots } = await import('@/features/games/domain/slotting');

			// 9 total slots, 3 allocated → 6 should convert → 4 priority + 2 regular
			const slotting = {
				sides: [{ id: 's1', name: 'US', color: '#000', squads: [{ id: 'sq1', name: 'A', slots: [
					{ id: 'a1', role: '1', access: 'unit' as const, occupant: null },
					{ id: 'a2', role: '2', access: 'unit' as const, occupant: null },
					{ id: 'a3', role: '3', access: 'unit' as const, occupant: null },
					{ id: 'a4', role: '4', access: 'unit' as const, occupant: null },
					{ id: 'a5', role: '5', access: 'unit' as const, occupant: null },
					{ id: 'a6', role: '6', access: 'unit' as const, occupant: null },
					{ id: 'a7', role: '7', access: 'unit' as const, occupant: null },
					{ id: 'a8', role: '8', access: 'unit' as const, occupant: null },
					{ id: 'a9', role: '9', access: 'unit' as const, occupant: null }
				] }] }]
			};

			const result = autoConvertUnclaimedSlots(slotting, new Map([['s1', 3]]));
			expect(result).not.toBeNull();
			const slots = result!.sides[0].squads[0].slots;
			const priority = slots.filter(s => s.access === 'priority');
			const regular = slots.filter(s => s.access === 'regular');
			expect(priority.length).toBe(4); // round(6 * 2/3) = 4
			expect(regular.length).toBe(2);
		});

		it('handles single non-unit slot — all goes to priority', async () => {
			const { autoConvertUnclaimedSlots } = await import('@/features/games/domain/slotting');

			const slotting = {
				sides: [{ id: 's1', name: 'US', color: '#000', squads: [{ id: 'sq1', name: 'A', slots: [
					{ id: 'a1', role: '1', access: 'unit' as const, occupant: null },
					{ id: 'a2', role: '2', access: 'unit' as const, occupant: null }
				] }] }]
			};

			// 2 total, 1 allocated → 1 converts → round(1 * 2/3) = 1 priority, 0 regular
			const result = autoConvertUnclaimedSlots(slotting, new Map([['s1', 1]]));
			expect(result).not.toBeNull();
			const slots = result!.sides[0].squads[0].slots;
			expect(slots.filter(s => s.access === 'priority').length).toBe(1);
			expect(slots.filter(s => s.access === 'regular').length).toBe(0);
		});
	});

	describe('auto-conversion bidirectional — reverting excess', () => {
		it('reverts non-unit slots back to unit when allocations increase', async () => {
			const { autoConvertUnclaimedSlots } = await import('@/features/games/domain/slotting');

			// Simulate: previously had 2 allocated → 2 non-unit. Now 4 allocated → only 1 non-unit needed.
			const slotting = {
				sides: [{ id: 's1', name: 'US', color: '#000', squads: [{ id: 'sq1', name: 'A', slots: [
					{ id: 'a1', role: 'L', access: 'unit' as const, occupant: { type: 'placeholder' as const, label: 'TT' } },
					{ id: 'a2', role: 'R', access: 'unit' as const, occupant: { type: 'placeholder' as const, label: 'TT' } },
					{ id: 'a3', role: 'M', access: 'priority' as const, occupant: null },
					{ id: 'a4', role: 'G', access: 'regular' as const, occupant: null },
					{ id: 'a5', role: 'MG', access: 'unit' as const, occupant: null }
				] }] }]
			};

			// 5 total, now 4 allocated → only 1 non-unit needed, but 2 exist
			const result = autoConvertUnclaimedSlots(slotting, new Map([['s1', 4]]));
			expect(result).not.toBeNull();
			const slots = result!.sides[0].squads[0].slots;
			const nonUnit = slots.filter(s => s.access !== 'unit');
			expect(nonUnit.length).toBe(1);
			// Bottom slot (a4 regular at index 3) reverted first
			expect(slots[3].access).toBe('unit');
		});

		it('does not revert occupied non-unit slots', async () => {
			const { autoConvertUnclaimedSlots } = await import('@/features/games/domain/slotting');

			const slotting = {
				sides: [{ id: 's1', name: 'US', color: '#000', squads: [{ id: 'sq1', name: 'A', slots: [
					{ id: 'a1', role: 'L', access: 'unit' as const, occupant: null },
					{ id: 'a2', role: 'R', access: 'priority' as const, occupant: { type: 'user' as const, userId: 99, callsign: 'Pro', assignedBy: 'self' as const, assignedAt: '2024-01-01' } },
					{ id: 'a3', role: 'M', access: 'priority' as const, occupant: null },
					{ id: 'a4', role: 'G', access: 'regular' as const, occupant: null }
				] }] }]
			};

			// 4 total, 3 allocated → need 1 non-unit, have 3. But a2 is occupied.
			// Only 2 convertible (a3 + a4), need to convert 2 → result: 1 non-unit (a2, occupied)
			const result = autoConvertUnclaimedSlots(slotting, new Map([['s1', 3]]));
			expect(result).not.toBeNull();
			const slots = result!.sides[0].squads[0].slots;
			// a2 stays priority (occupied), a3 & a4 reverted to unit
			expect(slots[1].access).toBe('priority');
			expect(slots[1].occupant).not.toBeNull();
			expect(slots[2].access).toBe('unit');
			expect(slots[3].access).toBe('unit');
		});
	});

	describe('player without unit cannot claim unit slots', () => {
		it('rejects claim from player not in any unit', async () => {
			const { POST } = await import('@/app/api/games/[shortCode]/claim-unit/route');
			const { NextRequest } = await import('next/server');
			setupTwoUnitMission(dbOps);

			const sid = createSteamSession(dbOps, { steamid64: PLAYER_NO_UNIT_STEAM_ID, redirectPath: '/' });

			const res = await POST(
				new NextRequest('http://localhost/api/games/edge-test/claim-unit', {
					method: 'POST',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ slotId: 'us-a-1' })
				}),
				gameRouteContext('edge-test')
			);
			expect(res.status).toBe(403);
			expect((await res.json()).error).toBe('not_unit_leader');
		});
	});

	describe('unit not assigned to mission', () => {
		it('rejects claim when unit exists but is not assigned to the mission', async () => {
			const { POST } = await import('@/app/api/games/[shortCode]/claim-unit/route');
			const { NextRequest } = await import('next/server');
			const db = getDb();

			// Create mission and a unit, but DO NOT assign unit to mission
			db.prepare(`
				INSERT INTO missions (status, title, description, short_code, slotting_json, early_password, final_password,
					created_by_steamid64, updated_by_steamid64, unit_slotting_manual_state)
				VALUES ('published', 'Unassigned Test', '', 'unassigned', ?, 'pw1', 'pw2', ?, ?, 'open')
			`).run(JSON.stringify(createAllUnitSlotting()), ADMIN_STEAM_ID, ADMIN_STEAM_ID);

			const leaderId = createConfirmedPlayer(dbOps, LEADER_A_STEAM_ID, 'OrphanLeader');
			const unitResult = db.prepare(`
				INSERT INTO units (name, tag, status, leader_user_id, slots_allocated, created_by_user_id)
				VALUES ('Orphan', 'ORPH', 'verified', ?, 3, ?)
			`).run(leaderId, leaderId);
			db.prepare("INSERT INTO unit_memberships (unit_id, user_id, role) VALUES (?, ?, 'member')").run(Number(unitResult.lastInsertRowid), leaderId);

			const sid = createSteamSession(dbOps, { steamid64: LEADER_A_STEAM_ID, redirectPath: '/' });
			const res = await POST(
				new NextRequest('http://localhost/api/games/unassigned/claim-unit', {
					method: 'POST',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ slotId: 'us-a-1' })
				}),
				gameRouteContext('unassigned')
			);
			expect(res.status).toBe(403);
			expect((await res.json()).error).toBe('unit_not_assigned');
		});
	});

	describe('release after unit slotting closed', () => {
		it('rejects release when unit slotting is closed', async () => {
			const claimRoute = await import('@/app/api/games/[shortCode]/claim-unit/route');
			const releaseRoute = await import('@/app/api/games/[shortCode]/release-unit/route');
			const { NextRequest } = await import('next/server');
			const { missionId } = setupTwoUnitMission(dbOps);
			const db = getDb();

			const sid = createSteamSession(dbOps, { steamid64: LEADER_A_STEAM_ID, redirectPath: '/' });
			const headers = { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` };

			// Claim while open
			await claimRoute.POST(new NextRequest('http://localhost/api/games/edge-test/claim-unit', { method: 'POST', headers, body: JSON.stringify({ slotId: 'us-a-1' }) }), gameRouteContext('edge-test'));

			// Close unit slotting
			db.prepare("UPDATE missions SET unit_slotting_manual_state = 'closed' WHERE id = ?").run(missionId);

			// Try to release — should fail
			const res = await releaseRoute.POST(
				new NextRequest('http://localhost/api/games/edge-test/release-unit', { method: 'POST', headers, body: JSON.stringify({ slotId: 'us-a-1' }) }),
				gameRouteContext('edge-test')
			);
			expect(res.status).toBe(409);
			expect((await res.json()).error).toBe('unit_slotting_closed');
		});
	});

	describe('unit assignment validation', () => {
		it('rejects assignment of unverified unit', async () => {
			const { PUT } = await import('@/app/api/admin/games/[missionId]/unit-assignments/route');
			const { NextRequest } = await import('next/server');
			const db = getDb();

			const missionResult = db.prepare(`
				INSERT INTO missions (status, title, description, short_code, slotting_json, early_password, final_password,
					created_by_steamid64, updated_by_steamid64)
				VALUES ('published', 'Verify Test', '', 'verify-test', ?, 'pw1', 'pw2', ?, ?)
			`).run(JSON.stringify(createAllUnitSlotting()), ADMIN_STEAM_ID, ADMIN_STEAM_ID);
			const missionId = Number(missionResult.lastInsertRowid);

			const leaderId = createConfirmedPlayer(dbOps, LEADER_A_STEAM_ID, 'PendingLeader');
			const unitResult = db.prepare(`
				INSERT INTO units (name, tag, status, leader_user_id, slots_allocated, created_by_user_id)
				VALUES ('Pending Team', 'PEND', 'unverified', ?, 3, ?)
			`).run(leaderId, leaderId);
			const unitId = Number(unitResult.lastInsertRowid);

			const sid = createSteamSession(dbOps, { steamid64: ADMIN_STEAM_ID, redirectPath: '/en/admin/games' });
			const res = await PUT(
				new NextRequest(`http://localhost/api/admin/games/${missionId}/unit-assignments`, {
					method: 'PUT',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ assignments: [{ unitId, sideId: 'side-us' }] })
				}),
				missionRouteContext(missionId)
			);
			expect(res.status).toBe(400);
			expect((await res.json()).error).toBe('invalid_unit');
		});

		it('rejects assignment of unit with zero slots_allocated', async () => {
			const { PUT } = await import('@/app/api/admin/games/[missionId]/unit-assignments/route');
			const { NextRequest } = await import('next/server');
			const db = getDb();

			const missionResult = db.prepare(`
				INSERT INTO missions (status, title, description, short_code, slotting_json, early_password, final_password,
					created_by_steamid64, updated_by_steamid64)
				VALUES ('published', 'Zero Slots', '', 'zero-test', ?, 'pw1', 'pw2', ?, ?)
			`).run(JSON.stringify(createAllUnitSlotting()), ADMIN_STEAM_ID, ADMIN_STEAM_ID);
			const missionId = Number(missionResult.lastInsertRowid);

			const leaderId = createConfirmedPlayer(dbOps, LEADER_A_STEAM_ID, 'ZeroLeader');
			const unitResult = db.prepare(`
				INSERT INTO units (name, tag, status, leader_user_id, slots_allocated, created_by_user_id)
				VALUES ('Zero Team', 'ZERO', 'verified', ?, 0, ?)
			`).run(leaderId, leaderId);
			const unitId = Number(unitResult.lastInsertRowid);

			const sid = createSteamSession(dbOps, { steamid64: ADMIN_STEAM_ID, redirectPath: '/en/admin/games' });
			const res = await PUT(
				new NextRequest(`http://localhost/api/admin/games/${missionId}/unit-assignments`, {
					method: 'PUT',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ assignments: [{ unitId, sideId: 'side-us' }] })
				}),
				missionRouteContext(missionId)
			);
			expect(res.status).toBe(400);
			expect((await res.json()).error).toBe('invalid_unit');
		});
	});

	describe('nonexistent slot or mission', () => {
		it('rejects claim with nonexistent slot ID', async () => {
			const { POST } = await import('@/app/api/games/[shortCode]/claim-unit/route');
			const { NextRequest } = await import('next/server');
			setupTwoUnitMission(dbOps);

			const sid = createSteamSession(dbOps, { steamid64: LEADER_A_STEAM_ID, redirectPath: '/' });
			const res = await POST(
				new NextRequest('http://localhost/api/games/edge-test/claim-unit', {
					method: 'POST',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ slotId: 'does-not-exist' })
				}),
				gameRouteContext('edge-test')
			);
			expect(res.status).toBe(404);
			expect((await res.json()).error).toBe('slot_not_found');
		});

		it('rejects claim on nonexistent mission', async () => {
			const { POST } = await import('@/app/api/games/[shortCode]/claim-unit/route');
			const { NextRequest } = await import('next/server');
			setupTwoUnitMission(dbOps);

			const sid = createSteamSession(dbOps, { steamid64: LEADER_A_STEAM_ID, redirectPath: '/' });
			const res = await POST(
				new NextRequest('http://localhost/api/games/fake-mission/claim-unit', {
					method: 'POST',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ slotId: 'us-a-1' })
				}),
				gameRouteContext('fake-mission')
			);
			expect(res.status).toBe(404);
		});
	});

	describe('viewer context', () => {
		it('unit leader sees correct viewer fields', async () => {
			setupTwoUnitMission(dbOps);

			// Leader A claims a slot
			const claimRoute = await import('@/app/api/games/[shortCode]/claim-unit/route');
			const { NextRequest } = await import('next/server');
			const sid = createSteamSession(dbOps, { steamid64: LEADER_A_STEAM_ID, redirectPath: '/' });
			await claimRoute.POST(new NextRequest('http://localhost/api/games/edge-test/claim-unit', {
				method: 'POST',
				headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
				body: JSON.stringify({ slotId: 'us-a-1' })
			}), gameRouteContext('edge-test'));

			const { getGameByShortCode } = await import('@/features/games/infra/sqliteGames');
			const result = getGameByShortCode({ shortCode: 'edge-test', steamId64: LEADER_A_STEAM_ID });
			expect(result.success).toBe(true);
			if (!result.success) return;

			const v = result.mission.viewer;
			expect(v.isUnitLeader).toBe(true);
			expect(v.unitTag).toBe('ALFA');
			expect(v.unitSideId).toBe('side-us');
			expect(v.unitSlotsUsed).toBe(1);
			expect(v.unitSlotsAllocated).toBe(3);
			expect(v.canClaimUnitSlot).toBe(true);
		});

		it('regular member sees isUnitLeader=false and canClaimUnitSlot=false', async () => {
			setupTwoUnitMission(dbOps);

			const { getGameByShortCode } = await import('@/features/games/infra/sqliteGames');
			const result = getGameByShortCode({ shortCode: 'edge-test', steamId64: MEMBER_STEAM_ID });
			expect(result.success).toBe(true);
			if (!result.success) return;

			const v = result.mission.viewer;
			expect(v.isUnitLeader).toBe(false);
			expect(v.unitTag).toBe('ALFA'); // still sees their unit
			expect(v.canClaimUnitSlot).toBe(false);
		});

		it('player without unit sees null unit fields', async () => {
			setupTwoUnitMission(dbOps);

			const { getGameByShortCode } = await import('@/features/games/infra/sqliteGames');
			const result = getGameByShortCode({ shortCode: 'edge-test', steamId64: PLAYER_NO_UNIT_STEAM_ID });
			expect(result.success).toBe(true);
			if (!result.success) return;

			const v = result.mission.viewer;
			expect(v.isUnitLeader).toBe(false);
			expect(v.unitId).toBeNull();
			expect(v.unitTag).toBeNull();
			expect(v.unitSideId).toBeNull();
			expect(v.canClaimUnitSlot).toBe(false);
		});
	});

	describe('unit gameplay password access', () => {
		it('unit member sees final password after priority gameplay released', async () => {
			const { missionId } = setupTwoUnitMission(dbOps);
			const db = getDb();

			// Release unit gameplay first, then priority gameplay
			db.prepare(`
				UPDATE missions SET unit_gameplay_released_at = CURRENT_TIMESTAMP,
					unit_gameplay_ever_released = 1,
					priority_gameplay_released_at = CURRENT_TIMESTAMP,
					priority_gameplay_ever_released = 1,
					priority_claim_manual_state = 'closed',
					unit_slotting_manual_state = 'closed',
					regular_join_enabled = 0
				WHERE id = ?
			`).run(missionId);

			const { getGameByShortCode } = await import('@/features/games/infra/sqliteGames');

			// Unit A member should see the final password (has unit gameplay access)
			const resultMember = getGameByShortCode({ shortCode: 'edge-test', steamId64: MEMBER_STEAM_ID });
			expect(resultMember.success).toBe(true);
			if (!resultMember.success) return;
			expect(resultMember.mission.password.stage).toBe('final');
			expect(resultMember.mission.password.value).toBe('final-pw');

			// Player without unit should NOT see the final password (no access yet)
			const resultNoUnit = getGameByShortCode({ shortCode: 'edge-test', steamId64: PLAYER_NO_UNIT_STEAM_ID });
			expect(resultNoUnit.success).toBe(true);
			if (!resultNoUnit.success) return;
			expect(resultNoUnit.mission.password.stage).toBeNull();
			expect(resultNoUnit.mission.password.waitingForViewerAccess).toBe(true);
		});
	});

	describe('slotting revision tracking', () => {
		it('each claim increments slotting revision', async () => {
			const { POST } = await import('@/app/api/games/[shortCode]/claim-unit/route');
			const { NextRequest } = await import('next/server');
			setupTwoUnitMission(dbOps);

			const sid = createSteamSession(dbOps, { steamid64: LEADER_A_STEAM_ID, redirectPath: '/' });
			const headers = { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` };

			const { revision: rev0 } = getSlotting('edge-test');

			await POST(new NextRequest('http://localhost/api/games/edge-test/claim-unit', { method: 'POST', headers, body: JSON.stringify({ slotId: 'us-a-1' }) }), gameRouteContext('edge-test'));
			const { revision: rev1 } = getSlotting('edge-test');
			expect(rev1).toBe(rev0 + 1);

			await POST(new NextRequest('http://localhost/api/games/edge-test/claim-unit', { method: 'POST', headers, body: JSON.stringify({ slotId: 'us-a-2' }) }), gameRouteContext('edge-test'));
			const { revision: rev2 } = getSlotting('edge-test');
			expect(rev2).toBe(rev0 + 2);
		});
	});
});
