import { beforeAll, describe, expect, it } from 'vitest';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';
import { buildTestApplicationRecord } from '../../../../fixtures/application';

async function loadAdminRenameHarness() {
	const { dbOperations } = await import('../../../../fixtures/dbOperations');
	const { GET } = await import('@/app/api/admin/rename-requests/route');
	const { POST: POST_DECIDE } = await import('@/app/api/admin/rename-requests/decide/route');
	const { POST: POST_RENAME_REQUIRED } = await import('@/app/api/admin/rename-required/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, GET, POST_DECIDE, POST_RENAME_REQUIRED, NextRequest };
}

describe('Admin rename endpoints (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({
			prefix: 'triad-tactics-admin-rename-test',
			adminSteamIds: '76561198012345678'
		});
	});

	it('requires admin config + authenticated admin', async () => {
		const { GET, NextRequest } = await loadAdminRenameHarness();
		const req = new NextRequest('http://localhost/api/admin/rename-requests', { method: 'GET' });
		const res = await GET(req);
		expect(res.status).toBe(401);
		const json = await res.json();
		expect(json.error).toBe('steam_not_logged_in');
	});

	it('can require rename for a Steam user, then list pending requests after user submits', async () => {
		const { GET, POST_RENAME_REQUIRED, dbOperations, NextRequest } = await loadAdminRenameHarness();

		const adminSid = createSteamSession(dbOperations, {
			steamid64: '76561198012345678',
			redirectPath: '/en/admin'
		});
		const targetSteamId = '76561198000000020';

		// Confirm the player (rename-required gate requires confirmed user).
		const inserted = dbOperations.insertApplication(
			buildTestApplicationRecord({
				email: `admin-rename-${crypto.randomUUID()}@example.com`,
				steamid64: targetSteamId,
				callsign: 'Confirmed_Admin_Target'
			})
		);
		expect(inserted.success).toBe(true);
		if (!inserted.success) throw new Error('Expected application to be inserted');
		const applicationId = Number(inserted.id);
		expect(Number.isFinite(applicationId)).toBe(true);
		const confirmed = dbOperations.confirmApplication(applicationId, '76561198012345678');
		expect(confirmed.success).toBe(true);

		// Require rename.
		const resRequire = await POST_RENAME_REQUIRED(
			new NextRequest('http://localhost/api/admin/rename-required', {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ steamid64: targetSteamId, action: 'require', reason: 'Policy' })
			})
		);
		expect(resRequire.status).toBe(200);

		// Seed a rename request directly (keeps this test scoped to admin list endpoint).
		const ensured = dbOperations.getOrCreateUserBySteamId64({ steamid64: targetSteamId });
		expect(ensured.success).toBe(true);
		if (!ensured.success || !ensured.user) {
			throw new Error('Expected user to exist');
		}
		const created = dbOperations.createRenameRequest({
			userId: ensured.user.id,
			newCallsign: 'Renamed_Admin_List'
		});
		expect(created.success).toBe(true);

		const resList = await GET(
			new NextRequest('http://localhost/api/admin/rename-requests?status=pending', {
				method: 'GET',
				headers: { cookie: `tt_steam_session=${adminSid}` }
			})
		);
		expect(resList.status).toBe(200);
		const json = await resList.json();
		expect(json.success).toBe(true);
		expect(json.count).toBeGreaterThanOrEqual(1);
		const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
		expect(
			json.renameRequests.some(
				(r: unknown) =>
					isRecord(r) && r.status === 'pending' && r.new_callsign === 'Renamed_Admin_List'
			)
		).toBe(true);
	});

	it('decide endpoint validates payload and can decline a pending request', async () => {
		const { POST_DECIDE, dbOperations, NextRequest } = await loadAdminRenameHarness();
		const adminSid = createSteamSession(dbOperations, {
			steamid64: '76561198012345678',
			redirectPath: '/en/admin'
		});
		const targetSteamId = '76561198000000021';

		const ensured = dbOperations.getOrCreateUserBySteamId64({ steamid64: targetSteamId });
		expect(ensured.success).toBe(true);
		if (!ensured.success || !ensured.user) {
			throw new Error('Expected user to exist');
		}
		dbOperations.setUserRenameRequiredBySteamId64({
			steamid64: targetSteamId,
			requestedBySteamId64: '76561198012345678',
			reason: 'Policy'
		});
		const created = dbOperations.createRenameRequest({
			userId: ensured.user.id,
			newCallsign: 'Renamed_To_Decline'
		});
		expect(created.success).toBe(true);
		if (!created.success) {
			throw new Error('Expected rename request to be created');
		}

		const bad = await POST_DECIDE(
			new NextRequest('http://localhost/api/admin/rename-requests/decide', {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ requestId: 'nope', decision: 'maybe' })
			})
		);
		expect(bad.status).toBe(400);

		const res = await POST_DECIDE(
			new NextRequest('http://localhost/api/admin/rename-requests/decide', {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ requestId: created.id, decision: 'decline', declineReason: 'Nope' })
			})
		);
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);

		// Second decision should conflict (not_pending).
		const res2 = await POST_DECIDE(
			new NextRequest('http://localhost/api/admin/rename-requests/decide', {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ requestId: created.id, decision: 'decline' })
			})
		);
		expect(res2.status).toBe(409);
		const json2 = await res2.json();
		expect(json2.error).toBe('not_pending');
	});
});
