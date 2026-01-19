import { beforeAll, describe, expect, it } from 'vitest';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { buildTestApplicationRecord } from '../../../../fixtures/application';
import { createSteamSession } from '../../../../fixtures/steamSession';
async function loadRenameApiHarness() {
	const { dbOperations } = await import('@/platform/db');
	const { POST } = await import('@/app/api/rename/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, POST, NextRequest };
}
describe('Rename workflow: POST /api/rename (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb('triad-tactics-rename-route-test');
	});

	it('returns 401 when not authenticated', async () => {
		const { POST, NextRequest } = await loadRenameApiHarness();
		const req = new NextRequest('http://localhost/api/rename', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ callsign: 'New_Callsign' })
		});
		const res = await POST(req);
		expect(res.status).toBe(401);
		const json = await res.json();
		expect(json).toEqual({ ok: false, error: 'not_authenticated' });
	});

	it('returns 400 for invalid payload', async () => {
		const { dbOperations, POST, NextRequest } = await loadRenameApiHarness();
		const steamid64 = '76561198000000001';
		const sid = createSteamSession(dbOperations, { steamid64, redirectPath: '/en' });

		// /api/rename is gated by apply-required; seed an application so the handler runs.
		dbOperations.insertApplication(
			buildTestApplicationRecord({
				email: `rename-invalid-${crypto.randomUUID()}@example.com`,
				steamid64,
				callsign: 'Existing_User'
			})
		);

		const req = new NextRequest('http://localhost/api/rename', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: `tt_steam_session=${sid}`
			},
			body: JSON.stringify({ callsign: 'ab' })
		});

		const res = await POST(req);
		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json).toEqual({ ok: false, error: 'invalid_request' });
	});

	it('returns 400 when rename is not required', async () => {
		const { dbOperations, POST, NextRequest } = await loadRenameApiHarness();
		const steamid64 = '76561198000000002';
		const sid = createSteamSession(dbOperations, { steamid64, redirectPath: '/en' });

		// /api/rename is gated by apply-required; seed an application so the handler runs.
		dbOperations.insertApplication(
			buildTestApplicationRecord({
				email: `rename-not-required-${crypto.randomUUID()}@example.com`,
				steamid64,
				callsign: 'Existing_User_2'
			})
		);

		const req = new NextRequest('http://localhost/api/rename', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: `tt_steam_session=${sid}`
			},
			body: JSON.stringify({ callsign: 'New_Callsign' })
		});

		const res = await POST(req);
		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json).toEqual({ ok: false, error: 'rename_not_required' });
	});

	it('creates a request when rename is required', async () => {
		const { dbOperations, POST, NextRequest } = await loadRenameApiHarness();
		const steamid64 = '76561198000000003';
		const sid = createSteamSession(dbOperations, { steamid64, redirectPath: '/en' });

		// Seed an application so apply-required doesn't block /api/rename.
		dbOperations.insertApplication(
			buildTestApplicationRecord({
				email: `rename-required-${crypto.randomUUID()}@example.com`,
				steamid64,
				callsign: 'Existing_User_3'
			})
		);

		// Make rename required for this user.
		dbOperations.setUserRenameRequiredBySteamId64({
			steamid64,
			requestedBySteamId64: '76561198012345678',
			reason: 'Policy'
		});

		const req = new NextRequest('http://localhost/api/rename', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: `tt_steam_session=${sid}`
			},
			body: JSON.stringify({ callsign: 'Renamed_User' })
		});

		const res = await POST(req);
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.ok).toBe(true);
		expect(json.status).toBe('created');
		expect(typeof json.requestId).toBe('number');
	});

	it('returns 409 callsign_taken when an existing user already has the callsign (case-insensitive exact match)', async () => {
		const { dbOperations, POST, NextRequest } = await loadRenameApiHarness();

		// Seed an existing user callsign via application insertion.
		dbOperations.insertApplication(
			buildTestApplicationRecord({
				email: `rename-taken-seed-${crypto.randomUUID()}@example.com`,
				steamid64: '76561198000000999',
				callsign: 'Ghost'
			})
		);

		const steamid64 = '76561198000000005';
		const sid = createSteamSession(dbOperations, { steamid64, redirectPath: '/en' });

		// Seed an application so apply-required doesn't block /api/rename.
		dbOperations.insertApplication(
			buildTestApplicationRecord({
				email: `rename-taken-${crypto.randomUUID()}@example.com`,
				steamid64,
				callsign: 'Existing_User_5'
			})
		);

		dbOperations.setUserRenameRequiredBySteamId64({
			steamid64,
			requestedBySteamId64: '76561198012345678',
			reason: 'Policy'
		});

		const req = new NextRequest('http://localhost/api/rename', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: `tt_steam_session=${sid}`
			},
			body: JSON.stringify({ callsign: 'gHoSt' })
		});

		const res = await POST(req);
		expect(res.status).toBe(409);
		const json = await res.json();
		expect(json).toEqual({ ok: false, error: 'callsign_taken' });
	});

	it('returns ok already_pending when a pending request exists', async () => {
		const { dbOperations, POST, NextRequest } = await loadRenameApiHarness();
		const steamid64 = '76561198000000004';
		const sid = createSteamSession(dbOperations, { steamid64, redirectPath: '/en' });

		// Seed an application so apply-required doesn't block /api/rename.
		dbOperations.insertApplication(
			buildTestApplicationRecord({
				email: `rename-pending-${crypto.randomUUID()}@example.com`,
				steamid64,
				callsign: 'Existing_User_4'
			})
		);

		dbOperations.setUserRenameRequiredBySteamId64({
			steamid64,
			requestedBySteamId64: '76561198012345678',
			reason: 'Policy'
		});

		const r1 = await POST(
			new NextRequest('http://localhost/api/rename', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					cookie: `tt_steam_session=${sid}`
				},
				body: JSON.stringify({ callsign: 'Renamed_User_2' })
			})
		);
		expect(r1.status).toBe(200);

		const r2 = await POST(
			new NextRequest('http://localhost/api/rename', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					cookie: `tt_steam_session=${sid}`
				},
				body: JSON.stringify({ callsign: 'Renamed_User_3' })
			})
		);
		expect(r2.status).toBe(200);
		const json2 = await r2.json();
		expect(json2).toEqual({ ok: true, status: 'already_pending' });

		// Sanity: still only one pending request.
		const ensured = dbOperations.getOrCreateUserBySteamId64({ steamid64 });
		expect(ensured.success).toBe(true);
		if (!ensured.success || !ensured.user) {
			throw new Error('Expected user to exist');
		}
		const pending = dbOperations.hasPendingRenameRequestByUserId(ensured.user.id);
		expect(pending).toBe(true);
	});
});
