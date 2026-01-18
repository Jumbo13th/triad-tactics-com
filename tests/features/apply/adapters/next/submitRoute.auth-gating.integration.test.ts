import { beforeAll, describe, expect, it, vi } from 'vitest';

async function loadSubmitApiRoute() {
	process.env.DISABLE_RATE_LIMITS = 'true';

	const { dbOperations } = await import('@/platform/db');
	const { POST } = await import('@/app/api/submit/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, POST, NextRequest };
}

function buildApplicationPayload(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		callsign: 'Test_User',
		name: 'Test Name',
		age: '25',
		email: 'test@example.com',
		city: 'Test City',
		country: 'Test Country',
		availability: 'Weekends and evenings',
		timezone: 'UTC+02:00',
		experience: 'I have experience with milsim communities and moderation.',
		motivation: 'I want to help the community and contribute in a positive way.',
		...overrides
	};
}

beforeAll(() => {
	delete process.env.STEAM_WEB_API_KEY;
});

beforeAll(async () => {
	const os = await import('node:os');
	const path = await import('node:path');
	const ts = new Date().toISOString().replace(/[:.]/g, '-');
	process.env.DB_PATH = path.join(os.tmpdir(), `triad-tactics-submit-auth-gating-${ts}-${crypto.randomUUID()}.db`);
	vi.resetModules();
	const { dbOperations } = await import('@/platform/db');
	dbOperations.clearAll();
});

async function createConnectedSteamCookieHeader() {
	const { dbOperations } = await loadSubmitApiRoute();
	const sid = crypto.randomUUID();
	dbOperations.createSteamSession({ id: sid, redirect_path: '/en/apply' });
	dbOperations.setSteamSessionIdentity(sid, { steamid64: '76561198000000000', persona_name: 'Test' });
	return `tt_steam_session=${sid}`;
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
			body: JSON.stringify(buildApplicationPayload())
		});

		const res = await POST(req);
		expect(res.status).toBe(401);
		const json = await res.json();
		expect(json.error).toBe('steam_required');
	});

	it('accepts missing city/country (validation passes) and still gates on Steam session', async () => {
		const { POST, NextRequest } = await loadSubmitApiRoute();

		const body: Record<string, unknown> = buildApplicationPayload({
			city: undefined,
			country: undefined
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
