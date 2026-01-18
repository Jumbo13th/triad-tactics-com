import { beforeAll, describe, expect, it } from 'vitest';

async function loadAdminApiHarness() {
	process.env.DISABLE_RATE_LIMITS = 'true';
	process.env.ADMIN_STEAM_IDS = '76561198012345678';

	const { dbOperations } = await import('@/platform/db');
	const { GET: GET_ADMIN } = await import('@/app/api/admin/route');
	const { GET: GET_STATUS } = await import('@/app/api/admin/status/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, GET_ADMIN, GET_STATUS, NextRequest };
}

describe('Admin API: Steam allowlist auth', () => {
	beforeAll(async () => {
		// Use an isolated DB for tests.
		const os = await import('node:os');
		const path = await import('node:path');
		const ts = new Date().toISOString().replace(/[:.]/g, '-');
		process.env.DB_PATH = path.join(os.tmpdir(), `triad-tactics-admin-test-${ts}-${crypto.randomUUID()}.db`);

		const { dbOperations } = await import('@/platform/db');
		dbOperations.clearAll();
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

		const sid = crypto.randomUUID();
		dbOperations.createSteamSession({ id: sid, redirect_path: '/en' });
		dbOperations.setSteamSessionIdentity(sid, { steamid64: '76561198000000000', persona_name: 'Not Admin' });

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
		dbOperations.insertApplication({
			email: 'admin-test@example.com',
			steamid64: '76561198011111111',
			persona_name: 'Applicant',
			answers: {
				callsign: 'Applicant',
				name: 'Applicant Name',
				age: '25',
				city: 'Test City',
				country: 'Test Country',
				availability: 'Weekends',
				timezone: 'UTC+00:00',
				experience: 'Test experience',
				motivation: 'Test motivation'
			},
			ip_address: '203.0.113.10',
			locale: 'en'
		});

		const sid = crypto.randomUUID();
		dbOperations.createSteamSession({ id: sid, redirect_path: '/en/admin' });
		dbOperations.setSteamSessionIdentity(sid, { steamid64: '76561198012345678', persona_name: 'Admin' });

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
