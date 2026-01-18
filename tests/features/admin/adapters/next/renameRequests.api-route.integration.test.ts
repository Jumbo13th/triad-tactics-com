import { beforeAll, describe, expect, it } from 'vitest';

async function setupIsolatedDb(prefix: string) {
	const os = await import('node:os');
	const path = await import('node:path');
	const ts = new Date().toISOString().replace(/[:.]/g, '-');
	process.env.DB_PATH = path.join(os.tmpdir(), `${prefix}-${ts}-${crypto.randomUUID()}.db`);
	process.env.DISABLE_RATE_LIMITS = 'true';

	const { dbOperations } = await import('@/platform/db');
	dbOperations.clearAll();
	return { dbOperations };
}

async function loadAdminRenameHarness() {
	process.env.ADMIN_STEAM_IDS = '76561198012345678';
	const { dbOperations } = await import('@/platform/db');
	const { GET } = await import('@/app/api/admin/rename-requests/route');
	const { POST: POST_DECIDE } = await import('@/app/api/admin/rename-requests/decide/route');
	const { POST: POST_RENAME_REQUIRED } = await import('@/app/api/admin/rename-required/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, GET, POST_DECIDE, POST_RENAME_REQUIRED, NextRequest };
}

async function createSteamSession(steamid64: string, redirectPath = '/en/admin') {
	const { dbOperations } = await import('@/platform/db');
	const sid = crypto.randomUUID();
	dbOperations.createSteamSession({ id: sid, redirect_path: redirectPath });
	dbOperations.setSteamSessionIdentity(sid, { steamid64, persona_name: 'Test Persona' });
	return sid;
}

describe('Admin rename endpoints (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb('triad-tactics-admin-rename-test');
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

		const adminSid = await createSteamSession('76561198012345678');
		const targetSteamId = '76561198000000020';

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
		const adminSid = await createSteamSession('76561198012345678');
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
