import { beforeAll, describe, expect, it } from 'vitest';

async function loadCallsignApiHarness() {
	process.env.DISABLE_RATE_LIMITS = 'true';

	const { dbOperations } = await import('@/platform/db');
	const { GET: GET_CHECK } = await import('@/app/api/callsign/check/route');
	const { GET: GET_SEARCH } = await import('@/app/api/callsign/search/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, GET_CHECK, GET_SEARCH, NextRequest };
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

describe('Callsign API routes', () => {
	beforeAll(async () => {
		// Use an isolated DB for tests.
		const os = await import('node:os');
		const path = await import('node:path');
		const ts = new Date().toISOString().replace(/[:.]/g, '-');
		process.env.DB_PATH = path.join(os.tmpdir(), `triad-tactics-callsign-test-${ts}-${crypto.randomUUID()}.db`);

		const { dbOperations } = await import('@/platform/db');
		dbOperations.clearAll();
	});

	it('GET /api/callsign/check returns 400 on invalid callsign', async () => {
		const { GET_CHECK, NextRequest } = await loadCallsignApiHarness();
		const req = new NextRequest('http://localhost/api/callsign/check?callsign=ab', { method: 'GET' });
		const res = await GET_CHECK(req);
		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json).toEqual({ ok: false, error: 'invalid_request' });
	});

	it('GET /api/callsign/check returns ok when available', async () => {
		const { GET_CHECK, NextRequest } = await loadCallsignApiHarness();
		const req = new NextRequest('http://localhost/api/callsign/check?callsign=Charlie', { method: 'GET' });
		const res = await GET_CHECK(req);
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.ok).toBe(true);
		expect(Array.isArray(json.exactMatches)).toBe(true);
		expect(Array.isArray(json.soundMatches)).toBe(true);
	});

	it('GET /api/callsign/check reports a sound-alike conflict (Ghost vs G0st)', async () => {
		const { dbOperations, GET_CHECK, NextRequest } = await loadCallsignApiHarness();

		// Seed an existing callsign.
		dbOperations.insertApplication(
			buildMinimalApplication({
				email: `ghost-${crypto.randomUUID()}@example.com`,
				steamid64: `765611980${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`,
				callsign: 'G0st'
			})
		);

		const req = new NextRequest('http://localhost/api/callsign/check?callsign=Ghost', { method: 'GET' });
		const res = await GET_CHECK(req);
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.ok).toBe(true);
		expect(json.soundMatches).toContain('G0st');
	});

	it('GET /api/callsign/search returns 400 without q', async () => {
		const { GET_SEARCH, NextRequest } = await loadCallsignApiHarness();
		const req = new NextRequest('http://localhost/api/callsign/search', { method: 'GET' });
		const res = await GET_SEARCH(req);
		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json).toEqual({ ok: false, error: 'invalid_request' });
	});

	it('GET /api/callsign/search returns results and caps at 25', async () => {
		const { dbOperations, GET_SEARCH, NextRequest } = await loadCallsignApiHarness();

		for (let i = 0; i < 30; i++) {
			const n = String(i).padStart(2, '0');
			dbOperations.insertApplication(
				buildMinimalApplication({
					email: `user-${n}-${crypto.randomUUID()}@example.com`,
					steamid64: `765611981${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`,
					callsign: `User_${n}`
				})
			);
		}

		const req = new NextRequest('http://localhost/api/callsign/search?q=User_', { method: 'GET' });
		const res = await GET_SEARCH(req);
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.ok).toBe(true);
		expect(json.total).toBeGreaterThanOrEqual(30);
		expect(Array.isArray(json.results)).toBe(true);
		expect(json.results.length).toBeLessThanOrEqual(25);
	});
});
