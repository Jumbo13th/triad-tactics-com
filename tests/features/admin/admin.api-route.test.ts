import { beforeAll, describe, expect, it } from 'vitest';
import { setupIsolatedDb } from '../../fixtures/isolatedDb';
import { buildTestApplicationRecord } from '../../fixtures/application';
import { createSteamSession } from '../../fixtures/steamSession';

async function loadAdminApiHarness() {
	const { dbOperations } = await import('@/platform/db');
	const { GET: GET_ADMIN } = await import('@/app/api/admin/route');
	const { GET: GET_STATUS } = await import('@/app/api/admin/status/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, GET_ADMIN, GET_STATUS, NextRequest };
}

describe('Admin API: Steam allowlist auth', () => {
	beforeAll(async () => {
		await setupIsolatedDb({
			prefix: 'triad-tactics-admin-test',
			adminSteamIds: '76561198012345678'
		});
	});

	it('returns connected=false for status without session', async () => {
		const { GET_STATUS, NextRequest } = await loadAdminApiHarness();
		const req = new NextRequest('http://localhost/api/admin/status', { method: 'GET' });
		const res = await GET_STATUS(req);
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.connected).toBe(false);
	});

	it('rejects /api/admin without Steam session', async () => {
		const { GET_ADMIN, NextRequest } = await loadAdminApiHarness();
		const req = new NextRequest('http://localhost/api/admin', { method: 'GET' });
		const res = await GET_ADMIN(req);
		expect(res.status).toBe(401);
		const json = await res.json();
		expect(json.error).toBe('steam_not_logged_in');
	});

	it('rejects /api/admin for non-admin Steam session', async () => {
		const { dbOperations, GET_ADMIN, NextRequest } = await loadAdminApiHarness();
		const sid = createSteamSession(dbOperations, {
			steamid64: '76561198000000000',
			redirectPath: '/en',
			personaName: 'Not Admin'
		});

		const req = new NextRequest('http://localhost/api/admin', {
			method: 'GET',
			headers: {
				cookie: `tt_steam_session=${sid}`
			}
		});

		const res = await GET_ADMIN(req);
		expect(res.status).toBe(403);
		const json = await res.json();
		expect(json.error).toBe('forbidden');
	});

	it('allows /api/admin for admin Steam session', async () => {
		const { dbOperations, GET_ADMIN, NextRequest } = await loadAdminApiHarness();

		// Seed a single application.
		dbOperations.insertApplication(
			buildTestApplicationRecord({
				email: 'admin-test@example.com',
				steamid64: '76561198011111111',
				callsign: 'Applicant',
				overrides: { answers: { name: 'Applicant Name' } }
			})
		);

		const sid = createSteamSession(dbOperations, {
			steamid64: '76561198012345678',
			redirectPath: '/en/admin',
			personaName: 'Admin'
		});

		const req = new NextRequest('http://localhost/api/admin', {
			method: 'GET',
			headers: {
				cookie: `tt_steam_session=${sid}`
			}
		});

		const res = await GET_ADMIN(req);
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.count).toBeGreaterThan(0);
	});
});
