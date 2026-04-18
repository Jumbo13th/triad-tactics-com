import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../../../fixtures/dbOperations';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';
import { buildTestApplicationRecord } from '../../../../fixtures/application';

const ADMIN_STEAM_ID = '76561198099990001';
const LEADER_STEAM_ID = '76561198099990002';
const PLAYER_STEAM_ID = '76561198099990003';
const PLAYER2_STEAM_ID = '76561198099990004';

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
	const { POST: POST_SLOTS } = await import('@/app/api/admin/units/[unitId]/slots/route');
	const { GET: GET_UNIT } = await import('@/app/api/units/[unitId]/route');
	const { NextRequest } = await import('next/server');
	return {
		dbOperations, POST_UNITS, POST_APPLY, POST_LEAVE, POST_MEMBERS,
		POST_TRANSFER, POST_VERIFY, POST_SLOTS, GET_UNIT, NextRequest
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
	dbOps.confirmApplication(Number(inserted.id), ADMIN_STEAM_ID);
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

function getEvents(h: Awaited<ReturnType<typeof loadHarness>>, unitId: number, sessionId: string) {
	return h.GET_UNIT(
		new h.NextRequest(`http://localhost/api/units/${unitId}`, {
			headers: { cookie: `tt_steam_session=${sessionId}` }
		}),
		unitContext(unitId)
	).then(r => r.json()).then(d => d.events as Array<{ kind: string; actorCallsign: string | null; targetCallsign: string | null; meta: string | null }>);
}

describe('Unit events (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({ prefix: 'unit-events-test', adminSteamIds: ADMIN_STEAM_ID });
	});

	beforeEach(async () => {
		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		dbOperations.clearAll();
	});

	it('logs created event on unit creation', async () => {
		const h = await loadHarness();
		const leader = seedConfirmedPlayer(h.dbOperations, LEADER_STEAM_ID, 'Leader');

		const res = await h.POST_UNITS(new h.NextRequest('http://localhost/api/units', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${leader.sessionId}` },
			body: JSON.stringify({ ...UNIT_BODY, name: 'Test Unit', tag: 'TST' })
		}));
		const { id } = await res.json();
		const events = await getEvents(h, id, leader.sessionId);

		expect(events.some(e => e.kind === 'created' && e.actorCallsign === 'Leader')).toBe(true);
	});

	it('logs verified and unverified events', async () => {
		const h = await loadHarness();
		const leader = seedConfirmedPlayer(h.dbOperations, LEADER_STEAM_ID, 'Leader');
		const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');

		const res = await h.POST_UNITS(new h.NextRequest('http://localhost/api/units', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${leader.sessionId}` },
			body: JSON.stringify({ ...UNIT_BODY, name: 'Verify Unit', tag: 'VU' })
		}));
		const { id } = await res.json();

		await h.POST_VERIFY(
			new h.NextRequest(`http://localhost/api/admin/units/${id}/verify`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${admin.sessionId}`, origin: 'http://localhost' },
				body: JSON.stringify({ action: 'verify' })
			}),
			unitContext(id)
		);

		await h.POST_VERIFY(
			new h.NextRequest(`http://localhost/api/admin/units/${id}/verify`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${admin.sessionId}`, origin: 'http://localhost' },
				body: JSON.stringify({ action: 'unverify' })
			}),
			unitContext(id)
		);

		const events = await getEvents(h, id, leader.sessionId);
		expect(events.some(e => e.kind === 'verified' && e.actorCallsign === 'Admin')).toBe(true);
		expect(events.some(e => e.kind === 'unverified' && e.actorCallsign === 'Admin')).toBe(true);
	});

	it('logs member_applied when player applies', async () => {
		const h = await loadHarness();
		const leader = seedConfirmedPlayer(h.dbOperations, LEADER_STEAM_ID, 'Leader');
		const player = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Applicant');
		const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');

		const unitId = await createAndVerifyUnit(h, leader.sessionId, admin.sessionId, 'Apply Unit', 'APL');

		await h.POST_APPLY(
			new h.NextRequest(`http://localhost/api/units/${unitId}/apply`, {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			unitContext(unitId)
		);

		const events = await getEvents(h, unitId, leader.sessionId);
		expect(events.some(e => e.kind === 'member_applied' && e.actorCallsign === 'Applicant')).toBe(true);
	});

	it('logs application_withdrawn when applicant withdraws', async () => {
		const h = await loadHarness();
		const leader = seedConfirmedPlayer(h.dbOperations, LEADER_STEAM_ID, 'Leader');
		const player = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Applicant');
		const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');

		const unitId = await createAndVerifyUnit(h, leader.sessionId, admin.sessionId, 'Withdraw Unit', 'WDR');

		await h.POST_APPLY(
			new h.NextRequest(`http://localhost/api/units/${unitId}/apply`, {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			unitContext(unitId)
		);

		await h.POST_LEAVE(
			new h.NextRequest(`http://localhost/api/units/${unitId}/leave`, {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			unitContext(unitId)
		);

		const events = await getEvents(h, unitId, leader.sessionId);
		expect(events.some(e => e.kind === 'application_withdrawn' && e.actorCallsign === 'Applicant')).toBe(true);
		expect(events.some(e => e.kind === 'member_left')).toBe(false);
	});

	it('logs member_approved and applicant_rejected correctly', async () => {
		const h = await loadHarness();
		const leader = seedConfirmedPlayer(h.dbOperations, LEADER_STEAM_ID, 'Leader');
		const player = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'GoodPlayer');
		const player2 = seedConfirmedPlayer(h.dbOperations, PLAYER2_STEAM_ID, 'BadPlayer');
		const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');

		const unitId = await createAndVerifyUnit(h, leader.sessionId, admin.sessionId, 'Approve Unit', 'APR');

		await h.POST_APPLY(
			new h.NextRequest(`http://localhost/api/units/${unitId}/apply`, {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			unitContext(unitId)
		);
		await h.POST_APPLY(
			new h.NextRequest(`http://localhost/api/units/${unitId}/apply`, {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${player2.sessionId}` }
			}),
			unitContext(unitId)
		);

		await h.POST_MEMBERS(
			new h.NextRequest(`http://localhost/api/units/${unitId}/members`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${leader.sessionId}` },
				body: JSON.stringify({ userId: player.userId, action: 'approve' })
			}),
			unitContext(unitId)
		);
		await h.POST_MEMBERS(
			new h.NextRequest(`http://localhost/api/units/${unitId}/members`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${leader.sessionId}` },
				body: JSON.stringify({ userId: player2.userId, action: 'reject' })
			}),
			unitContext(unitId)
		);

		const events = await getEvents(h, unitId, leader.sessionId);
		expect(events.some(e => e.kind === 'member_approved' && e.targetCallsign === 'GoodPlayer' && e.actorCallsign === 'Leader')).toBe(true);
		expect(events.some(e => e.kind === 'applicant_rejected' && e.targetCallsign === 'BadPlayer' && e.actorCallsign === 'Leader')).toBe(true);
	});

	it('logs member_left when member leaves', async () => {
		const h = await loadHarness();
		const leader = seedConfirmedPlayer(h.dbOperations, LEADER_STEAM_ID, 'Leader');
		const player = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Leaver');
		const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');

		const unitId = await createAndVerifyUnit(h, leader.sessionId, admin.sessionId, 'Leave Unit', 'LVE');

		getDb().prepare(`INSERT INTO unit_memberships (unit_id, user_id, role) VALUES (?, ?, 'member')`).run(unitId, player.userId);

		await h.POST_LEAVE(
			new h.NextRequest(`http://localhost/api/units/${unitId}/leave`, {
				method: 'POST',
				headers: { cookie: `tt_steam_session=${player.sessionId}` }
			}),
			unitContext(unitId)
		);

		const events = await getEvents(h, unitId, leader.sessionId);
		expect(events.some(e => e.kind === 'member_left' && e.actorCallsign === 'Leaver')).toBe(true);
		expect(events.some(e => e.kind === 'application_withdrawn')).toBe(false);
	});

	it('logs member_removed when leader kicks a member', async () => {
		const h = await loadHarness();
		const leader = seedConfirmedPlayer(h.dbOperations, LEADER_STEAM_ID, 'Leader');
		const player = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'Kicked');
		const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');

		const unitId = await createAndVerifyUnit(h, leader.sessionId, admin.sessionId, 'Kick Unit', 'KCK');

		getDb().prepare(`INSERT INTO unit_memberships (unit_id, user_id, role) VALUES (?, ?, 'member')`).run(unitId, player.userId);

		await h.POST_MEMBERS(
			new h.NextRequest(`http://localhost/api/units/${unitId}/members`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${leader.sessionId}` },
				body: JSON.stringify({ userId: player.userId, action: 'remove' })
			}),
			unitContext(unitId)
		);

		const events = await getEvents(h, unitId, leader.sessionId);
		expect(events.some(e => e.kind === 'member_removed' && e.targetCallsign === 'Kicked' && e.actorCallsign === 'Leader')).toBe(true);
	});

	it('logs leader_changed on transfer', async () => {
		const h = await loadHarness();
		const leader = seedConfirmedPlayer(h.dbOperations, LEADER_STEAM_ID, 'OldLeader');
		const player = seedConfirmedPlayer(h.dbOperations, PLAYER_STEAM_ID, 'NewLeader');
		const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');

		const unitId = await createAndVerifyUnit(h, leader.sessionId, admin.sessionId, 'Transfer Unit', 'TRN');

		getDb().prepare(`INSERT INTO unit_memberships (unit_id, user_id, role) VALUES (?, ?, 'member')`).run(unitId, player.userId);

		await h.POST_TRANSFER(
			new h.NextRequest(`http://localhost/api/units/${unitId}/transfer-leadership`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${leader.sessionId}` },
				body: JSON.stringify({ userId: player.userId })
			}),
			unitContext(unitId)
		);

		const events = await getEvents(h, unitId, leader.sessionId);
		expect(events.some(e => e.kind === 'leader_changed' && e.targetCallsign === 'NewLeader')).toBe(true);
	});

	it('logs slots_changed when admin sets slots', async () => {
		const h = await loadHarness();
		const leader = seedConfirmedPlayer(h.dbOperations, LEADER_STEAM_ID, 'Leader');
		const admin = seedConfirmedPlayer(h.dbOperations, ADMIN_STEAM_ID, 'Admin');

		const res = await h.POST_UNITS(new h.NextRequest('http://localhost/api/units', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${leader.sessionId}` },
			body: JSON.stringify({ ...UNIT_BODY, name: 'Slots Unit', tag: 'SLT' })
		}));
		const { id } = await res.json();

		await h.POST_SLOTS(
			new h.NextRequest(`http://localhost/api/admin/units/${id}/slots`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: `tt_steam_session=${admin.sessionId}`, origin: 'http://localhost' },
				body: JSON.stringify({ slotsAllocated: 16 })
			}),
			unitContext(id)
		);

		const events = await getEvents(h, id, leader.sessionId);
		expect(events.some(e => e.kind === 'slots_changed' && e.meta === '16')).toBe(true);
	});
});
