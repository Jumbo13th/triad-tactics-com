import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb, type DbOperations } from '../../../../fixtures/dbOperations';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';
import { buildTestApplicationRecord } from '../../../../fixtures/application';

const ADMIN_STEAM_ID = '76561198099990001';
const LEADER_STEAM_ID = '76561198099990002';
const MEMBER_STEAM_ID = '76561198099990003';

function missionRouteContext(missionId: number | string) {
	return { params: Promise.resolve({ missionId: String(missionId) }) };
}

function gameRouteContext(shortCode: string) {
	return { params: Promise.resolve({ shortCode }) };
}

function createSlottingWithUnitSlots() {
	return {
		sides: [
			{
				id: 'side-us', name: 'US', displayName: 'US Army', color: '#3B82F6',
				squads: [{
					id: 'us-squad-1', name: 'Alpha',
					slots: [
						{ id: 'us-s1-slot1', role: 'Squad Leader', access: 'unit', occupant: null },
						{ id: 'us-s1-slot2', role: 'Rifleman', access: 'unit', occupant: null },
						{ id: 'us-s1-slot3', role: 'Medic', access: 'priority', occupant: null },
						{ id: 'us-s1-slot4', role: 'Grenadier', access: 'regular', occupant: null }
					]
				}]
			},
			{
				id: 'side-ru', name: 'RU', color: '#EF4444',
				squads: [{
					id: 'ru-squad-1', name: 'Bravo',
					slots: [
						{ id: 'ru-s1-slot1', role: 'Squad Leader', access: 'unit', occupant: null },
						{ id: 'ru-s1-slot2', role: 'Rifleman', access: 'unit', occupant: null }
					]
				}]
			}
		]
	};
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
	return user.id;
}

function setupMissionWithUnits(dbOps: DbOperations) {
	const db = getDb();

	const missionResult = db.prepare(`
		INSERT INTO missions (status, title, description, short_code, slotting_json, early_password, final_password,
			created_by_steamid64, updated_by_steamid64)
		VALUES ('published', 'Test Mission', '', 'test-unit', ?, 'early-pw', 'final-pw', ?, ?)
	`).run(JSON.stringify(createSlottingWithUnitSlots()), ADMIN_STEAM_ID, ADMIN_STEAM_ID);
	const missionId = Number(missionResult.lastInsertRowid);

	const leaderId = createConfirmedPlayer(dbOps, LEADER_STEAM_ID, 'LeaderGuy');
	const memberId = createConfirmedPlayer(dbOps, MEMBER_STEAM_ID, 'MemberGuy');

	const unitResult = db.prepare(`
		INSERT INTO units (name, tag, status, leader_user_id, slots_allocated, created_by_user_id)
		VALUES ('Test Team', 'TT', 'verified', ?, 2, ?)
	`).run(leaderId, leaderId);
	const unitId = Number(unitResult.lastInsertRowid);

	db.prepare("INSERT INTO unit_memberships (unit_id, user_id, role) VALUES (?, ?, 'member')").run(unitId, leaderId);
	db.prepare("INSERT INTO unit_memberships (unit_id, user_id, role) VALUES (?, ?, 'member')").run(unitId, memberId);
	db.prepare("INSERT INTO mission_unit_assignments (mission_id, unit_id, side_id, assigned_by_steamid64) VALUES (?, ?, 'side-us', ?)").run(missionId, unitId, ADMIN_STEAM_ID);
	db.prepare("UPDATE missions SET unit_slotting_manual_state = 'open' WHERE id = ?").run(missionId);

	return { missionId, unitId, leaderId, memberId };
}

describe('Unit slotting (integration)', () => {
	let dbOps: DbOperations;

	beforeAll(async () => {
		await setupIsolatedDb({ prefix: 'unit-slotting-test', adminSteamIds: ADMIN_STEAM_ID });
	});

	beforeEach(async () => {
		const mod = await import('../../../../fixtures/dbOperations');
		dbOps = mod.dbOperations;
		dbOps.clearAll();
	});

	describe('claim unit slot', () => {
		it('allows unit leader to claim a unit-access slot on assigned side', async () => {
			const { POST } = await import('@/app/api/games/[shortCode]/claim-unit/route');
			const { NextRequest } = await import('next/server');
			setupMissionWithUnits(dbOps);
			const sid = createSteamSession(dbOps, { steamid64: LEADER_STEAM_ID, redirectPath: '/' });

			const res = await POST(
				new NextRequest('http://localhost/api/games/test-unit/claim-unit', {
					method: 'POST',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ slotId: 'us-s1-slot1' })
				}),
				gameRouteContext('test-unit')
			);

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.success).toBe(true);

			const db = getDb();
			const row = db.prepare('SELECT slotting_json, slotting_revision FROM missions WHERE short_code = ?').get('test-unit') as { slotting_json: string; slotting_revision: number };
			const slotting = JSON.parse(row.slotting_json);
			expect(slotting.sides[0].squads[0].slots[0].occupant).toEqual({ type: 'placeholder', label: 'TT' });
			expect(row.slotting_revision).toBe(2);
		});

		it('rejects claim when unit slotting is closed', async () => {
			const { POST } = await import('@/app/api/games/[shortCode]/claim-unit/route');
			const { NextRequest } = await import('next/server');
			const { missionId } = setupMissionWithUnits(dbOps);
			const sid = createSteamSession(dbOps, { steamid64: LEADER_STEAM_ID, redirectPath: '/' });
			getDb().prepare("UPDATE missions SET unit_slotting_manual_state = 'closed' WHERE id = ?").run(missionId);

			const res = await POST(
				new NextRequest('http://localhost/api/games/test-unit/claim-unit', {
					method: 'POST',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ slotId: 'us-s1-slot1' })
				}),
				gameRouteContext('test-unit')
			);

			expect(res.status).toBe(409);
			expect((await res.json()).error).toBe('unit_slotting_closed');
		});

		it('rejects claim from non-leader member', async () => {
			const { POST } = await import('@/app/api/games/[shortCode]/claim-unit/route');
			const { NextRequest } = await import('next/server');
			setupMissionWithUnits(dbOps);
			const sid = createSteamSession(dbOps, { steamid64: MEMBER_STEAM_ID, redirectPath: '/' });

			const res = await POST(
				new NextRequest('http://localhost/api/games/test-unit/claim-unit', {
					method: 'POST',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ slotId: 'us-s1-slot1' })
				}),
				gameRouteContext('test-unit')
			);

			expect(res.status).toBe(403);
			expect((await res.json()).error).toBe('not_unit_leader');
		});

		it('rejects claim on wrong side', async () => {
			const { POST } = await import('@/app/api/games/[shortCode]/claim-unit/route');
			const { NextRequest } = await import('next/server');
			setupMissionWithUnits(dbOps);
			const sid = createSteamSession(dbOps, { steamid64: LEADER_STEAM_ID, redirectPath: '/' });

			const res = await POST(
				new NextRequest('http://localhost/api/games/test-unit/claim-unit', {
					method: 'POST',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ slotId: 'ru-s1-slot1' })
				}),
				gameRouteContext('test-unit')
			);

			expect(res.status).toBe(403);
			expect((await res.json()).error).toBe('wrong_side');
		});

		it('rejects claim on non-unit slot', async () => {
			const { POST } = await import('@/app/api/games/[shortCode]/claim-unit/route');
			const { NextRequest } = await import('next/server');
			setupMissionWithUnits(dbOps);
			const sid = createSteamSession(dbOps, { steamid64: LEADER_STEAM_ID, redirectPath: '/' });

			const res = await POST(
				new NextRequest('http://localhost/api/games/test-unit/claim-unit', {
					method: 'POST',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ slotId: 'us-s1-slot3' })
				}),
				gameRouteContext('test-unit')
			);

			expect(res.status).toBe(404);
			expect((await res.json()).error).toBe('slot_not_found');
		});

		it('enforces slots_allocated limit', async () => {
			const { POST } = await import('@/app/api/games/[shortCode]/claim-unit/route');
			const { NextRequest } = await import('next/server');
			const { unitId } = setupMissionWithUnits(dbOps);
			const sid = createSteamSession(dbOps, { steamid64: LEADER_STEAM_ID, redirectPath: '/' });
			getDb().prepare('UPDATE units SET slots_allocated = 1 WHERE id = ?').run(unitId);

			const headers = { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` };
			const res1 = await POST(new NextRequest('http://localhost/api/games/test-unit/claim-unit', { method: 'POST', headers, body: JSON.stringify({ slotId: 'us-s1-slot1' }) }), gameRouteContext('test-unit'));
			expect(res1.status).toBe(200);

			const res2 = await POST(new NextRequest('http://localhost/api/games/test-unit/claim-unit', { method: 'POST', headers, body: JSON.stringify({ slotId: 'us-s1-slot2' }) }), gameRouteContext('test-unit'));
			expect(res2.status).toBe(409);
			expect((await res2.json()).error).toBe('slots_exhausted');
		});

		it('rejects claim on occupied slot', async () => {
			const { POST } = await import('@/app/api/games/[shortCode]/claim-unit/route');
			const { NextRequest } = await import('next/server');
			setupMissionWithUnits(dbOps);
			const sid = createSteamSession(dbOps, { steamid64: LEADER_STEAM_ID, redirectPath: '/' });

			const db = getDb();
			const row = db.prepare('SELECT slotting_json FROM missions WHERE short_code = ?').get('test-unit') as { slotting_json: string };
			const slotting = JSON.parse(row.slotting_json);
			slotting.sides[0].squads[0].slots[0].occupant = { type: 'placeholder', label: 'OTHER' };
			db.prepare('UPDATE missions SET slotting_json = ? WHERE short_code = ?').run(JSON.stringify(slotting), 'test-unit');

			const res = await POST(
				new NextRequest('http://localhost/api/games/test-unit/claim-unit', {
					method: 'POST',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ slotId: 'us-s1-slot1' })
				}),
				gameRouteContext('test-unit')
			);

			expect(res.status).toBe(409);
			expect((await res.json()).error).toBe('slot_taken');
		});
	});

	describe('release unit slot', () => {
		it('allows leader to release own unit slot', async () => {
			const claimRoute = await import('@/app/api/games/[shortCode]/claim-unit/route');
			const releaseRoute = await import('@/app/api/games/[shortCode]/release-unit/route');
			const { NextRequest } = await import('next/server');
			setupMissionWithUnits(dbOps);
			const sid = createSteamSession(dbOps, { steamid64: LEADER_STEAM_ID, redirectPath: '/' });
			const headers = { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` };

			await claimRoute.POST(new NextRequest('http://localhost/api/games/test-unit/claim-unit', { method: 'POST', headers, body: JSON.stringify({ slotId: 'us-s1-slot1' }) }), gameRouteContext('test-unit'));

			const res = await releaseRoute.POST(
				new NextRequest('http://localhost/api/games/test-unit/release-unit', { method: 'POST', headers, body: JSON.stringify({ slotId: 'us-s1-slot1' }) }),
				gameRouteContext('test-unit')
			);

			expect(res.status).toBe(200);
			const db = getDb();
			const row = db.prepare('SELECT slotting_json FROM missions WHERE short_code = ?').get('test-unit') as { slotting_json: string };
			expect(JSON.parse(row.slotting_json).sides[0].squads[0].slots[0].occupant).toBeNull();
		});

		it('rejects releasing slot owned by another unit', async () => {
			const releaseRoute = await import('@/app/api/games/[shortCode]/release-unit/route');
			const { NextRequest } = await import('next/server');
			setupMissionWithUnits(dbOps);
			const sid = createSteamSession(dbOps, { steamid64: LEADER_STEAM_ID, redirectPath: '/' });

			const db = getDb();
			const row = db.prepare('SELECT slotting_json FROM missions WHERE short_code = ?').get('test-unit') as { slotting_json: string };
			const slotting = JSON.parse(row.slotting_json);
			slotting.sides[0].squads[0].slots[0].occupant = { type: 'placeholder', label: 'OTHER' };
			db.prepare('UPDATE missions SET slotting_json = ? WHERE short_code = ?').run(JSON.stringify(slotting), 'test-unit');

			const res = await releaseRoute.POST(
				new NextRequest('http://localhost/api/games/test-unit/release-unit', {
					method: 'POST',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ slotId: 'us-s1-slot1' })
				}),
				gameRouteContext('test-unit')
			);

			expect(res.status).toBe(403);
			expect((await res.json()).error).toBe('not_your_unit_slot');
		});
	});

	describe('unit assignments', () => {
		it('admin can assign units to sides', async () => {
			const { PUT } = await import('@/app/api/admin/games/[missionId]/unit-assignments/route');
			const { NextRequest } = await import('next/server');
			const { missionId, unitId } = setupMissionWithUnits(dbOps);
			const sid = createSteamSession(dbOps, { steamid64: ADMIN_STEAM_ID, redirectPath: '/en/admin/games' });

			const res = await PUT(
				new NextRequest(`http://localhost/api/admin/games/${missionId}/unit-assignments`, {
					method: 'PUT',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ assignments: [{ unitId, sideId: 'side-ru' }] })
				}),
				missionRouteContext(missionId)
			);

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.success).toBe(true);
			expect(json.mission.unitAssignments).toHaveLength(1);
			expect(json.mission.unitAssignments[0].sideId).toBe('side-ru');
		});

		it('rejects assignment to invalid side', async () => {
			const { PUT } = await import('@/app/api/admin/games/[missionId]/unit-assignments/route');
			const { NextRequest } = await import('next/server');
			const { missionId, unitId } = setupMissionWithUnits(dbOps);
			const sid = createSteamSession(dbOps, { steamid64: ADMIN_STEAM_ID, redirectPath: '/en/admin/games' });

			const res = await PUT(
				new NextRequest(`http://localhost/api/admin/games/${missionId}/unit-assignments`, {
					method: 'PUT',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` },
					body: JSON.stringify({ assignments: [{ unitId, sideId: 'nonexistent' }] })
				}),
				missionRouteContext(missionId)
			);

			expect(res.status).toBe(400);
			expect((await res.json()).error).toBe('invalid_side_id');
		});
	});

	describe('release unit gameplay', () => {
		it('releases password and closes unit slotting', async () => {
			const { POST } = await import('@/app/api/admin/games/[missionId]/release-unit/route');
			const { NextRequest } = await import('next/server');
			const { missionId } = setupMissionWithUnits(dbOps);
			const sid = createSteamSession(dbOps, { steamid64: ADMIN_STEAM_ID, redirectPath: '/en/admin/games' });

			const res = await POST(
				new NextRequest(`http://localhost/api/admin/games/${missionId}/release-unit`, {
					method: 'POST',
					headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `tt_steam_session=${sid}` }
				}),
				missionRouteContext(missionId)
			);

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.success).toBe(true);
			expect(json.mission.unitGameplayReleasedAt).toBeTruthy();
			expect(json.mission.unitSlottingManualState).toBe('closed');
		});
	});

	describe('domain helpers', () => {
		it('countUnitSlotsUsed counts placeholders by tag (case-insensitive)', async () => {
			const { countUnitSlotsUsed } = await import('@/features/games/domain/slotting');
			const slotting = {
				sides: [{ id: 's1', name: 'US', color: '#000000', squads: [{ id: 'sq1', name: 'A', slots: [
					{ id: 'sl1', role: 'L', access: 'unit' as const, occupant: { type: 'placeholder' as const, label: 'TT' } },
					{ id: 'sl2', role: 'R', access: 'unit' as const, occupant: { type: 'placeholder' as const, label: 'TT' } },
					{ id: 'sl3', role: 'M', access: 'unit' as const, occupant: { type: 'placeholder' as const, label: 'OTHER' } },
					{ id: 'sl4', role: 'G', access: 'unit' as const, occupant: null }
				] }] }]
			};
			expect(countUnitSlotsUsed(slotting, 'TT')).toBe(2);
			expect(countUnitSlotsUsed(slotting, 'tt')).toBe(2);
			expect(countUnitSlotsUsed(slotting, 'OTHER')).toBe(1);
			expect(countUnitSlotsUsed(slotting, 'NOBODY')).toBe(0);
		});

		it('autoConvertUnclaimedSlots converts correct number of slots with top-slot priority', async () => {
			const { autoConvertUnclaimedSlots } = await import('@/features/games/domain/slotting');

			// 10 total slots, 6 unit allocated = 4 should convert (3 priority, 1 regular)
			const slotting = {
				sides: [{
					id: 's1', name: 'US', color: '#000000',
					squads: [
						{ id: 'sq1', name: 'Alpha', slots: [
							{ id: 'a1', role: 'Squad Leader', access: 'unit' as const, occupant: { type: 'placeholder' as const, label: 'TT' } },
							{ id: 'a2', role: 'Rifleman', access: 'unit' as const, occupant: { type: 'placeholder' as const, label: 'TT' } },
							{ id: 'a3', role: 'Medic', access: 'unit' as const, occupant: null },
							{ id: 'a4', role: 'Grenadier', access: 'unit' as const, occupant: null },
							{ id: 'a5', role: 'MG', access: 'unit' as const, occupant: null }
						]},
						{ id: 'sq2', name: 'Bravo', slots: [
							{ id: 'b1', role: 'Squad Leader', access: 'unit' as const, occupant: null },
							{ id: 'b2', role: 'Rifleman', access: 'unit' as const, occupant: null },
							{ id: 'b3', role: 'Medic', access: 'unit' as const, occupant: null },
							{ id: 'b4', role: 'Grenadier', access: 'unit' as const, occupant: { type: 'placeholder' as const, label: 'ALFA' } },
							{ id: 'b5', role: 'MG', access: 'unit' as const, occupant: { type: 'placeholder' as const, label: 'ALFA' } }
						]}
					]
				}]
			};

			const result = autoConvertUnclaimedSlots(slotting, 6);
			expect(result).not.toBeNull();

			// 10 total - 6 allocated = 4 should convert
			const allSlots = result!.sides[0].squads.flatMap(sq => sq.slots);
			const prioritySlots = allSlots.filter(s => s.access === 'priority');
			const regularSlots = allSlots.filter(s => s.access === 'regular');
			const unitSlots = allSlots.filter(s => s.access === 'unit');

			expect(prioritySlots.length).toBe(3); // round(4 * 2/3) = 3
			expect(regularSlots.length).toBe(1);
			expect(unitSlots.length).toBe(6); // 4 claimed + 2 remaining unclaimed

			// Top slots (lower index) should get priority
			// Unclaimed slots sorted by slotIndex: a3(idx2), a4(idx3), a5(idx4), b1(idx0), b2(idx1), b3(idx2)
			// Sorted: b1(idx0), b2(idx1), a3(idx2), b3(idx2), a4(idx3), a5(idx4)
			// First 4 picked: b1, b2, a3, b3
			// First 3 = priority: b1, b2, a3
			// Last 1 = regular: b3
			expect(result!.sides[0].squads[1].slots[0].access).toBe('priority'); // b1 Squad Leader
			expect(result!.sides[0].squads[1].slots[1].access).toBe('priority'); // b2 Rifleman
			expect(result!.sides[0].squads[0].slots[2].access).toBe('priority'); // a3 Medic
			expect(result!.sides[0].squads[1].slots[2].access).toBe('regular'); // b3 Medic

			// Claimed slots should be untouched
			expect(result!.sides[0].squads[0].slots[0].access).toBe('unit'); // a1 claimed by TT
			expect(result!.sides[0].squads[1].slots[3].access).toBe('unit'); // b4 claimed by ALFA
		});

		it('autoConvertUnclaimedSlots returns null when no changes needed', async () => {
			const { autoConvertUnclaimedSlots } = await import('@/features/games/domain/slotting');
			const slotting = {
				sides: [{ id: 's1', name: 'US', color: '#000000', squads: [{ id: 'sq1', name: 'A', slots: [
					{ id: 'sl1', role: 'L', access: 'unit' as const, occupant: { type: 'placeholder' as const, label: 'TT' } },
					{ id: 'sl2', role: 'R', access: 'priority' as const, occupant: null },
					{ id: 'sl3', role: 'M', access: 'regular' as const, occupant: null }
				] }] }]
			};
			// 3 total, 1 allocated → 2 non-unit needed, 2 exist already → no changes
			expect(autoConvertUnclaimedSlots(slotting, 1)).toBeNull();
		});

		it('autoConvertUnclaimedSlots reverts excess non-unit slots back to unit', async () => {
			const { autoConvertUnclaimedSlots } = await import('@/features/games/domain/slotting');
			const slotting = {
				sides: [{ id: 's1', name: 'US', color: '#000000', squads: [{ id: 'sq1', name: 'A', slots: [
					{ id: 'sl1', role: 'Leader', access: 'unit' as const, occupant: { type: 'placeholder' as const, label: 'TT' } },
					{ id: 'sl2', role: 'Rifleman', access: 'priority' as const, occupant: null },
					{ id: 'sl3', role: 'Medic', access: 'priority' as const, occupant: null },
					{ id: 'sl4', role: 'MG', access: 'regular' as const, occupant: null }
				] }] }]
			};
			// 4 total, 3 allocated → only 1 non-unit needed, but 3 exist → revert 2
			const result = autoConvertUnclaimedSlots(slotting, 3);
			expect(result).not.toBeNull();
			const slots = result!.sides[0].squads[0].slots;
			const nonUnit = slots.filter(s => s.access !== 'unit');
			expect(nonUnit.length).toBe(1);
			// Bottom slots reverted first (MG at idx3, then Medic at idx2)
			expect(slots[3].access).toBe('unit'); // MG reverted
			expect(slots[2].access).toBe('unit'); // Medic reverted
			expect(slots[1].access).not.toBe('unit'); // Rifleman stays (priority or regular)
		});

	});
});
