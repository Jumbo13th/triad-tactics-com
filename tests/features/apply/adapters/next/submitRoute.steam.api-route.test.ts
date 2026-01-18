import { beforeAll, describe, expect, it } from 'vitest';

function requireEnv(name: string): string {
	const v = process.env[name];
	if (!v) {
		throw new Error(`Missing env var ${name}`);
	}
	return v;
}

function buildApplicationPayload(locale: string) {
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
		locale
	};
}

async function loadSubmitApiHarness() {
	process.env.DISABLE_RATE_LIMITS = 'true';

	const { dbOperations } = await import('@/platform/db');
	const { POST } = await import('@/app/api/submit/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, POST, NextRequest };
}

async function postSubmitWithSteamSession(opts: {
	steamid64: string;
	body: unknown;
	ip?: string;
}) {
	const { dbOperations, POST, NextRequest } = await loadSubmitApiHarness();

	const sid = crypto.randomUUID();
	dbOperations.createSteamSession({ id: sid, redirect_path: '/en/apply' });
	dbOperations.setSteamSessionIdentity(sid, {
		steamid64: opts.steamid64,
		persona_name: 'Test Persona'
	});

	const req = new NextRequest('http://localhost/api/submit', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			cookie: `tt_steam_session=${sid}`,
			'x-forwarded-for': opts.ip ?? '203.0.113.10'
		},
		body: JSON.stringify(opts.body)
	});

	return await POST(req);
}

describe('Apply workflow: submit route (live Steam via API route)', () => {
	beforeAll(async () => {
		const os = await import('node:os');
		const path = await import('node:path');
		const ts = new Date().toISOString().replace(/[:.]/g, '-');
		process.env.DB_PATH = path.join(
			os.tmpdir(),
			`triad-tactics-test-${ts}-${crypto.randomUUID()}.db`
		);
		const { dbOperations } = await import('@/platform/db');
		dbOperations.clearAll();
	});

	it('accepts a profile that owns Arma Reforger', async () => {
		process.env.STEAM_WEB_API_KEY = requireEnv('STEAM_WEB_API_KEY');
		const steamid64 = requireEnv('TEST_STEAMID64_OWNED');
		const { dbOperations } = await import('@/platform/db');
		dbOperations.deleteBySteamId64(steamid64);

		const res = await postSubmitWithSteamSession({
			steamid64,
			body: buildApplicationPayload('en')
		});
		expect(res.status).toBe(201);
		const json = await res.json();
		expect(json.success).toBe(true);
	});

	it('returns steam_game_not_detected when ownership cannot be verified', async () => {
		process.env.STEAM_WEB_API_KEY = requireEnv('STEAM_WEB_API_KEY');
		const steamid64 = requireEnv('TEST_STEAMID64_NOT_OWNED');

		const res = await postSubmitWithSteamSession({
			steamid64,
			body: buildApplicationPayload('en')
		});
		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json.error).toBe('steam_game_not_detected');
	});

	it('enforces uniqueness per user (second submit is duplicate)', async () => {
		process.env.STEAM_WEB_API_KEY = requireEnv('STEAM_WEB_API_KEY');
		const steamid64 = requireEnv('TEST_STEAMID64_OWNED');
		const { dbOperations } = await import('@/platform/db');
		dbOperations.deleteBySteamId64(steamid64);

		const res1 = await postSubmitWithSteamSession({
			steamid64,
			body: buildApplicationPayload('en'),
			ip: '203.0.113.11'
		});
		expect(res1.status).toBe(201);

		const res2 = await postSubmitWithSteamSession({
			steamid64,
			body: buildApplicationPayload('en'),
			ip: '203.0.113.12'
		});
		expect(res2.status).toBe(409);
		const json2 = await res2.json();
		expect(json2.error).toBe('duplicate');
	});

	it('normalizes unsupported locale to en', async () => {
		process.env.STEAM_WEB_API_KEY = requireEnv('STEAM_WEB_API_KEY');
		const steamid64 = requireEnv('TEST_STEAMID64_OWNED');

		const { dbOperations } = await import('@/platform/db');
		dbOperations.deleteBySteamId64(steamid64);

		const res = await postSubmitWithSteamSession({
			steamid64,
			body: buildApplicationPayload('de')
		});
		expect(res.status).toBe(201);

		const row = dbOperations.getBySteamId64(steamid64);
		expect(row?.locale).toBe('en');
	});
});
