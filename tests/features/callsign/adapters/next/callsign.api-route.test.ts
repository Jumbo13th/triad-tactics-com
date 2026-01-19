import { beforeAll, describe, expect, it } from 'vitest';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { buildTestApplicationRecord } from '../../../../fixtures/application';
import { createSteamCookieHeader, type DbOperationsForSteamSession } from '../../../../fixtures/steamSession';

async function loadCallsignApiHarness() {
	const { dbOperations } = await import('@/platform/db');
	const { GET: GET_CHECK } = await import('@/app/api/callsign/check/route');
	const { GET: GET_SEARCH } = await import('@/app/api/callsign/search/route');
	const { STEAM_SESSION_COOKIE } = await import('@/features/steamAuth/sessionCookie');
	const { NextRequest } = await import('next/server');
	return { dbOperations, GET_CHECK, GET_SEARCH, NextRequest, STEAM_SESSION_COOKIE };
}

function createConnectedSteamCookie(
	dbOperations: DbOperationsForSteamSession,
	cookieName: string
): { cookieHeader: string } {
	const steamid64 = `765611980${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
	const { cookieHeader } = createSteamCookieHeader(dbOperations, {
		cookieName,
		steamid64,
		redirectPath: '/',
		personaName: 'Test'
	});
	return { cookieHeader };
}

describe('Callsign API routes', () => {
	beforeAll(async () => {
		await setupIsolatedDb('triad-tactics-callsign-test');
	});

	it('GET /api/callsign/check returns 400 on invalid callsign', async () => {
		const { dbOperations, GET_CHECK, NextRequest, STEAM_SESSION_COOKIE } = await loadCallsignApiHarness();
		const { cookieHeader } = createConnectedSteamCookie(dbOperations, STEAM_SESSION_COOKIE);
		const req = new NextRequest('http://localhost/api/callsign/check?callsign=ab', {
			method: 'GET',
			headers: { cookie: cookieHeader }
		});
		const res = await GET_CHECK(req);
		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json).toEqual({ ok: false, error: 'invalid_request' });
	});

	it('GET /api/callsign/check returns ok when available', async () => {
		const { dbOperations, GET_CHECK, NextRequest, STEAM_SESSION_COOKIE } = await loadCallsignApiHarness();
		const { cookieHeader } = createConnectedSteamCookie(dbOperations, STEAM_SESSION_COOKIE);
		const req = new NextRequest('http://localhost/api/callsign/check?callsign=Charlie', {
			method: 'GET',
			headers: { cookie: cookieHeader }
		});
		const res = await GET_CHECK(req);
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.ok).toBe(true);
		expect(Array.isArray(json.exactMatches)).toBe(true);
		expect(Array.isArray(json.soundMatches)).toBe(true);
	});

	it('GET /api/callsign/check reports a sound-alike conflict (Ghost vs G0st)', async () => {
		const { dbOperations, GET_CHECK, NextRequest, STEAM_SESSION_COOKIE } = await loadCallsignApiHarness();
		const { cookieHeader } = createConnectedSteamCookie(dbOperations, STEAM_SESSION_COOKIE);

		// Seed an existing callsign.
		dbOperations.insertApplication(
			buildTestApplicationRecord({
				email: `ghost-${crypto.randomUUID()}@example.com`,
				steamid64: `765611980${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`,
				callsign: 'G0st'
			})
		);

		const req = new NextRequest('http://localhost/api/callsign/check?callsign=Ghost', {
			method: 'GET',
			headers: { cookie: cookieHeader }
		});
		const res = await GET_CHECK(req);
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.ok).toBe(true);
		expect(json.soundMatches).toContain('G0st');
	});

	it('GET /api/callsign/search returns 400 without q', async () => {
		const { dbOperations, GET_SEARCH, NextRequest, STEAM_SESSION_COOKIE } = await loadCallsignApiHarness();
		const { cookieHeader } = createConnectedSteamCookie(dbOperations, STEAM_SESSION_COOKIE);
		const req = new NextRequest('http://localhost/api/callsign/search', {
			method: 'GET',
			headers: { cookie: cookieHeader }
		});
		const res = await GET_SEARCH(req);
		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json).toEqual({ ok: false, error: 'invalid_request' });
	});

	it('GET /api/callsign/search returns results and caps at 25', async () => {
		const { dbOperations, GET_SEARCH, NextRequest, STEAM_SESSION_COOKIE } = await loadCallsignApiHarness();
		const { cookieHeader } = createConnectedSteamCookie(dbOperations, STEAM_SESSION_COOKIE);

		for (let i = 0; i < 30; i++) {
			const n = String(i).padStart(2, '0');
			dbOperations.insertApplication(
				buildTestApplicationRecord({
					email: `user-${n}-${crypto.randomUUID()}@example.com`,
					steamid64: `765611981${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`,
					callsign: `User_${n}`
				})
			);
		}

		const req = new NextRequest('http://localhost/api/callsign/search?q=User_', {
			method: 'GET',
			headers: { cookie: cookieHeader }
		});
		const res = await GET_SEARCH(req);
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.ok).toBe(true);
		expect(json.total).toBeGreaterThanOrEqual(30);
		expect(Array.isArray(json.results)).toBe(true);
		expect(json.results.length).toBeLessThanOrEqual(25);
	});
});
