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

async function loadRenameApiHarness() {
	const { dbOperations } = await import('@/platform/db');
	const { POST } = await import('@/app/api/rename/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, POST, NextRequest };
}

function buildMinimalApplication(opts: { email: string; steamid64: string; callsign: string }) {
	return {
		email: opts.email,
		steamid64: opts.steamid64,
		persona_name: 'Applicant',
		answers: {
			callsign: opts.callsign,
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
	};
}

async function createSteamSession(steamid64: string) {
	const { dbOperations } = await import('@/platform/db');
	const sid = crypto.randomUUID();
	dbOperations.createSteamSession({ id: sid, redirect_path: '/en' });
	dbOperations.setSteamSessionIdentity(sid, { steamid64, persona_name: 'Test Persona' });
	return sid;
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
		const { POST, NextRequest } = await loadRenameApiHarness();
		const steamid64 = '76561198000000001';
		const sid = await createSteamSession(steamid64);

		// /api/rename is gated by apply-required; seed an application so the handler runs.
		const { dbOperations } = await import('@/platform/db');
		dbOperations.insertApplication(
			buildMinimalApplication({
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
		const { POST, NextRequest } = await loadRenameApiHarness();
		const steamid64 = '76561198000000002';
		const sid = await createSteamSession(steamid64);

		// /api/rename is gated by apply-required; seed an application so the handler runs.
		const { dbOperations } = await import('@/platform/db');
		dbOperations.insertApplication(
			buildMinimalApplication({
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
		const sid = await createSteamSession(steamid64);

		// Seed an application so apply-required doesn't block /api/rename.
		dbOperations.insertApplication(
			buildMinimalApplication({
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

	it('returns ok already_pending when a pending request exists', async () => {
		const { dbOperations, POST, NextRequest } = await loadRenameApiHarness();
		const steamid64 = '76561198000000004';
		const sid = await createSteamSession(steamid64);

		// Seed an application so apply-required doesn't block /api/rename.
		dbOperations.insertApplication(
			buildMinimalApplication({
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
