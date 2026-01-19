import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { buildApplySubmitPayload } from '../../../../fixtures/applyPayload';
import { createSteamCookieHeader } from '../../../../fixtures/steamSession';

async function loadSubmitApiRoute() {
	const { dbOperations } = await import('@/platform/db');
	const { POST } = await import('@/app/api/submit/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, POST, NextRequest };
}

let previousSteamWebApiKey: string | undefined;

beforeAll(() => {
	previousSteamWebApiKey = process.env.STEAM_WEB_API_KEY;
	delete process.env.STEAM_WEB_API_KEY;
});

afterAll(() => {
	if (typeof previousSteamWebApiKey === 'string' && previousSteamWebApiKey.length > 0) {
		process.env.STEAM_WEB_API_KEY = previousSteamWebApiKey;
	} else {
		delete process.env.STEAM_WEB_API_KEY;
	}
});

beforeAll(async () => {
	vi.resetModules();
	await setupIsolatedDb('triad-tactics-submit-auth-gating');
});

async function createConnectedSteamCookieHeader() {
	const { dbOperations } = await loadSubmitApiRoute();
	return createSteamCookieHeader(dbOperations, {
		steamid64: '76561198000000000',
		redirectPath: '/en/apply',
		personaName: 'Test'
	}).cookieHeader;
}

describe('Apply workflow: submit route (integration: validation + auth gating)', () => {
	it('returns validation_error for invalid payload', async () => {
		const { POST, NextRequest } = await loadSubmitApiRoute();
		const cookie = await createConnectedSteamCookieHeader();

		const req = new NextRequest('http://localhost/api/submit', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie
			},
			body: JSON.stringify({ email: 'not-an-email' })
		});

		const res = await POST(req);
		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json.error).toBe('validation_error');
	});

	it('returns steam_required when valid payload but no Steam session', async () => {
		const { POST, NextRequest } = await loadSubmitApiRoute();

		const req = new NextRequest('http://localhost/api/submit', {
			method: 'POST',
			headers: {
				'content-type': 'application/json'
			},
			body: JSON.stringify(buildApplySubmitPayload())
		});

		const res = await POST(req);
		expect(res.status).toBe(401);
		const json = await res.json();
		expect(json.error).toBe('steam_required');
	});

	it('accepts missing city/country (validation passes) and still gates on Steam session', async () => {
		const { POST, NextRequest } = await loadSubmitApiRoute();

		const body: Record<string, unknown> = buildApplySubmitPayload({
			overrides: {
				city: undefined,
				country: undefined
			}
		});
		delete body.city;
		delete body.country;

		const req = new NextRequest('http://localhost/api/submit', {
			method: 'POST',
			headers: {
				'content-type': 'application/json'
			},
			body: JSON.stringify(body)
		});

		const res = await POST(req);
		expect(res.status).toBe(401);
		const json = await res.json();
		expect(json.error).toBe('steam_required');
	});
});
