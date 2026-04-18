import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../../../fixtures/dbOperations';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';
import { buildTestApplicationRecord } from '../../../../fixtures/application';

const ADMIN_STEAM_ID = '76561198099990001';
const LEADER_STEAM_ID = '76561198099990002';
const PLAYER_STEAM_ID = '76561198099990003';
const PLAYER2_STEAM_ID = '76561198099990004';
const PLAYER3_STEAM_ID = '76561198099990005';

const UNIT_BODY = {
	memberNames: 'Player1\nPlayer2\nPlayer3\nPlayer4\nPlayer5\nPlayer6',
	history: 'We have been playing together for years.',
	otherProjects: 'ProjectX weekly',
	acceptSundaySchedule: true,
	acceptSideCommanderRole: true
};

function unitContext(unitId: number | string) {
	return { params: Promise.resolve({ unitId: String(unitId) }) };
}

async function loadHarness() {
	const { dbOperations } = await import('../../../../fixtures/dbOperations');
	const { POST: POST_UNITS } = await import('@/app/api/units/route');
	const { POST: POST_APPLY } = await import('@/app/api/units/[unitId]/apply/route');
	const { POST: POST_LEAVE } = await import('@/app/api/units/[unitId]/leave/route');
	const { POST: POST_MEMBERS } = await import('@/app/api/units/[unitId]/members/route');
	const { POST: POST_TRANSFER } = await import('@/app/api/units/[unitId]/transfer-leadership/route');
	const { POST: POST_VERIFY } = await import('@/app/api/admin/units/[unitId]/verify/route');
	const { GET: GET_UNIT } = await import('@/app/api/units/[unitId]/route');
	const { NextRequest } = await import('next/server');
	return {
		dbOperations, POST_UNITS, POST_APPLY, POST_LEAVE, POST_MEMBERS,
		POST_TRANSFER, POST_VERIFY, GET_UNIT, NextRequest
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

async function createAndVerifyUnit(h: Awaited<ReturnType<typeof loadHarness>>, leaderSid: string, adminSid: string, name: string, tag: string): Promise<number> {
	const res = await h.POST_UNITS(new h.NextRequest('http://localhost/api/units', {
		method: 'POST',
		headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${leaderSid}` },
		body: JSON.stringify({ ...UNIT_BODY, name, tag })
	}));
	const { id } = await res.json();
	await h.POST_VERIFY(
		new h.NextRequest(`http://localhost/api/admin/units/${id}/verify`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${adminSid}`, origin: 'http://localhost' },
			body: JSON.stringify({ action: 'verify' })
		}),
		unitContext(id)
	);
	return id;
}

describe('Unit membership (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({ prefix: 'unit-membership-test', adminSteamIds: ADMIN_STEAM_ID });
	});

	beforeEach(async () => {
		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		dbOperations.clearAll();
	});

	it('player can apply with a message and leader sees it', async () => {
		const h = await loadHarness();
		const leader = seedConfirmedPlayer(h.dbOperations, LEADER_STEAM_ID, 'Leader');
		const player = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Applicant');
		const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');

		const unitId = await createAndVerifyUnit(h, leader.sessionId, admin.sessionId, 'Test Unit', 'TST');

		const applyRes = await h.POST_APPLY(
			new h.NextRequest(`http://localhost/api/units/${unitId}/apply`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${player.sessionId}` },
				body: JSON.stringify({ message: 'I have 500 hours in Arma' })
			}),
			unitContext(unitId)
		);
		expect(applyRes.status).toBe(200);

		const detail = await (await h.GET_UNIT(
			new h.NextRequest(`http://localhost/api/units/${unitId}`, {
				headers: { cookie: `tt_steam_session=${leader.sessionId}` }
			}),
			unitContext(unitId)
		)).json();

		const applicant = detail.members.find((m: { role: string }) => m.role === 'applicant');
		expect(applicant).toBeDefined();
		expect(applicant.callsign).toBe('Applicant');
		expect(applicant.message).toBe('I have 500 hours in Arma');
	});

	it('approving removes other pending applications', async () => {
		const h = await loadHarness();
		const leader1 = seedConfirmedPlayer(h.dbOperations, LEADER_STEAM_ID, 'Leader1');
		const leader2 = seedConfirmedPlayer(h.dbOperations, PLAYER2_STEAM_ID, 'Leader2');
		const player = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Player');
		const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');

		const unit1 = await createAndVerifyUnit(h, leader1.sessionId, admin.sessionId, 'Unit One', 'ONE');
		const unit2 = await createAndVerifyUnit(h, leader2.sessionId, admin.sessionId, 'Unit Two', 'TWO');

		await h.POST_APPLY(
			new h.NextRequest(`http://localhost/api/units/${unit1}/apply`, {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			unitContext(unit1)
		);
		await h.POST_APPLY(
			new h.NextRequest(`http://localhost/api/units/${unit2}/apply`, {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			unitContext(unit2)
		);

		await h.POST_MEMBERS(
			new h.NextRequest(`http://localhost/api/units/${unit1}/members`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${leader1.sessionId}` },
				body: JSON.stringify({ userId: player.userId, action: 'approve' })
			}),
			unitContext(unit1)
		);

		const unit2Detail = await (await h.GET_UNIT(
			new h.NextRequest(`http://localhost/api/units/${unit2}`, {
				headers: { cookie: `tt_steam_session=${leader2.sessionId}` }
			}),
			unitContext(unit2)
		)).json();
		expect(unit2Detail.unit.applicantCount).toBe(0);
	});

	it('cannot apply to an unverified unit', async () => {
		const h = await loadHarness();
		const leader = seedConfirmedPlayer(h.dbOperations, LEADER_STEAM_ID, 'Leader');
		const player = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Applicant');

		const res = await h.POST_UNITS(new h.NextRequest('http://localhost/api/units', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${leader.sessionId}` },
			body: JSON.stringify({ ...UNIT_BODY, name: 'Pending Unit', tag: 'PND' })
		}));
		const { id } = await res.json();

		const applyRes = await h.POST_APPLY(
			new h.NextRequest(`http://localhost/api/units/${id}/apply`, {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			unitContext(id)
		);
		expect(applyRes.status).toBe(409);
		expect((await applyRes.json()).error).toBe('unit_not_verified');
	});

	it('member of unverified unit cannot apply to other units', async () => {
		const h = await loadHarness();
		const leader1 = seedConfirmedPlayer(h.dbOperations, LEADER_STEAM_ID, 'Leader1');
		const leader2 = seedConfirmedPlayer(h.dbOperations, PLAYER2_STEAM_ID, 'Leader2');
		const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');

		await h.POST_UNITS(new h.NextRequest('http://localhost/api/units', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${leader1.sessionId}` },
			body: JSON.stringify({ ...UNIT_BODY, name: 'Unverified', tag: 'UNV' })
		}));

		const unit2 = await createAndVerifyUnit(h, leader2.sessionId, admin.sessionId, 'Verified', 'VER');

		const applyRes = await h.POST_APPLY(
			new h.NextRequest(`http://localhost/api/units/${unit2}/apply`, {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${leader1.sessionId}` }
			}),
			unitContext(unit2)
		);
		expect(applyRes.status).toBe(409);
		expect((await applyRes.json()).error).toBe('already_member');
	});

	it('cannot join two units as member', async () => {
		const h = await loadHarness();
		const leader1 = seedConfirmedPlayer(h.dbOperations, LEADER_STEAM_ID, 'Leader1');
		const player = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Player');
		const leader2 = seedConfirmedPlayer(h.dbOperations, PLAYER2_STEAM_ID, 'Leader2');
		const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');

		const unit1 = await createAndVerifyUnit(h, leader1.sessionId, admin.sessionId, 'Unit One', 'ONE');
		const unit2 = await createAndVerifyUnit(h, leader2.sessionId, admin.sessionId, 'Unit Two', 'TWO');

		await h.POST_APPLY(
			new h.NextRequest(`http://localhost/api/units/${unit1}/apply`, {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			unitContext(unit1)
		);
		await h.POST_MEMBERS(
			new h.NextRequest(`http://localhost/api/units/${unit1}/members`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${leader1.sessionId}` },
				body: JSON.stringify({ userId: player.userId, action: 'approve' })
			}),
			unitContext(unit1)
		);

		const applyRes = await h.POST_APPLY(
			new h.NextRequest(`http://localhost/api/units/${unit2}/apply`, {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			unitContext(unit2)
		);
		expect(applyRes.status).toBe(409);
		expect((await applyRes.json()).error).toBe('already_member');
	});

	it('leader cannot leave without transferring leadership', async () => {
		const h = await loadHarness();
		const leader = seedConfirmedPlayer(h.dbOperations, LEADER_STEAM_ID, 'Leader');
		const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');

		const unitId = await createAndVerifyUnit(h, leader.sessionId, admin.sessionId, 'LeaderUnit', 'LDR');

		const leaveRes = await h.POST_LEAVE(
			new h.NextRequest(`http://localhost/api/units/${unitId}/leave`, {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${leader.sessionId}` }
			}),
			unitContext(unitId)
		);
		expect(leaveRes.status).toBe(403);
		expect((await leaveRes.json()).error).toBe('is_leader');
	});

	it('leader can transfer leadership and then leave', async () => {
		const h = await loadHarness();
		const leader = seedConfirmedPlayer(h.dbOperations, LEADER_STEAM_ID, 'Leader');
		const player = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Player');
		const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');

		const unitId = await createAndVerifyUnit(h, leader.sessionId, admin.sessionId, 'TransferUnit', 'TRN');

		getDb().prepare(`INSERT INTO unit_memberships (unit_id, user_id, role) VALUES (?, ?, 'member')`).run(unitId, player.userId);

		const transferRes = await h.POST_TRANSFER(
			new h.NextRequest(`http://localhost/api/units/${unitId}/transfer-leadership`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${leader.sessionId}` },
				body: JSON.stringify({ userId: player.userId })
			}),
			unitContext(unitId)
		);
		expect(transferRes.status).toBe(200);

		const leaveRes = await h.POST_LEAVE(
			new h.NextRequest(`http://localhost/api/units/${unitId}/leave`, {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${leader.sessionId}` }
			}),
			unitContext(unitId)
		);
		expect(leaveRes.status).toBe(200);

		const detail = await (await h.GET_UNIT(
			new h.NextRequest(`http://localhost/api/units/${unitId}`, {
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			unitContext(unitId)
		)).json();
		expect(detail.events.some((e: { kind: string }) => e.kind === 'leader_changed')).toBe(true);
		expect(detail.events.some((e: { kind: string }) => e.kind === 'member_left')).toBe(true);
	});

	it('leader can reject an applicant', async () => {
		const h = await loadHarness();
		const leader = seedConfirmedPlayer(h.dbOperations, LEADER_STEAM_ID, 'Leader');
		const player = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Applicant');
		const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');

		const unitId = await createAndVerifyUnit(h, leader.sessionId, admin.sessionId, 'RejectUnit', 'REJ');

		await h.POST_APPLY(
			new h.NextRequest(`http://localhost/api/units/${unitId}/apply`, {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			unitContext(unitId)
		);

		const rejectRes = await h.POST_MEMBERS(
			new h.NextRequest(`http://localhost/api/units/${unitId}/members`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${leader.sessionId}` },
				body: JSON.stringify({ userId: player.userId, action: 'reject' })
			}),
			unitContext(unitId)
		);
		expect(rejectRes.status).toBe(200);

		const detail = await (await h.GET_UNIT(
			new h.NextRequest(`http://localhost/api/units/${unitId}`, {
				headers: { cookie: `tt_steam_session=${leader.sessionId}` }
			}),
			unitContext(unitId)
		)).json();
		expect(detail.unit.applicantCount).toBe(0);
		expect(detail.events.some((e: { kind: string }) => e.kind === 'applicant_rejected')).toBe(true);
	});

	it('kicked player can re-apply', async () => {
		const h = await loadHarness();
		const leader = seedConfirmedPlayer(h.dbOperations, LEADER_STEAM_ID, 'Leader');
		const player = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Player');
		const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');

		const unitId = await createAndVerifyUnit(h, leader.sessionId, admin.sessionId, 'KickUnit', 'KCK');

		getDb().prepare(`INSERT INTO unit_memberships (unit_id, user_id, role) VALUES (?, ?, 'member')`).run(unitId, player.userId);

		await h.POST_MEMBERS(
			new h.NextRequest(`http://localhost/api/units/${unitId}/members`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${leader.sessionId}` },
				body: JSON.stringify({ userId: player.userId, action: 'remove' })
			}),
			unitContext(unitId)
		);

		const reapplyRes = await h.POST_APPLY(
			new h.NextRequest(`http://localhost/api/units/${unitId}/apply`, {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			unitContext(unitId)
		);
		expect(reapplyRes.status).toBe(200);
	});

	it('player can apply to multiple units simultaneously', async () => {
		const h = await loadHarness();
		const leader1 = seedConfirmedPlayer(h.dbOperations, LEADER_STEAM_ID, 'Leader1');
		const leader2 = seedConfirmedPlayer(h.dbOperations, PLAYER2_STEAM_ID, 'Leader2');
		const player = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Player');
		const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');

		const unit1 = await createAndVerifyUnit(h, leader1.sessionId, admin.sessionId, 'Unit A', 'UA');
		const unit2 = await createAndVerifyUnit(h, leader2.sessionId, admin.sessionId, 'Unit B', 'UB');

		const apply1 = await h.POST_APPLY(
			new h.NextRequest(`http://localhost/api/units/${unit1}/apply`, {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			unitContext(unit1)
		);
		expect(apply1.status).toBe(200);

		const apply2 = await h.POST_APPLY(
			new h.NextRequest(`http://localhost/api/units/${unit2}/apply`, {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			unitContext(unit2)
		);
		expect(apply2.status).toBe(200);
	});

	it('cannot apply twice to the same unit', async () => {
		const h = await loadHarness();
		const leader = seedConfirmedPlayer(h.dbOperations, LEADER_STEAM_ID, 'Leader');
		const player = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Player');
		const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');

		const unitId = await createAndVerifyUnit(h, leader.sessionId, admin.sessionId, 'Double Apply', 'DBL');

		await h.POST_APPLY(
			new h.NextRequest(`http://localhost/api/units/${unitId}/apply`, {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			unitContext(unitId)
		);

		const secondApply = await h.POST_APPLY(
			new h.NextRequest(`http://localhost/api/units/${unitId}/apply`, {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			unitContext(unitId)
		);
		expect(secondApply.status).toBe(409);
		expect((await secondApply.json()).error).toBe('already_applicant');
	});
});
