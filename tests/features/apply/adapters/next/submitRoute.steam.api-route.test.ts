import { beforeAll, describe, expect, it } from 'vitest';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { buildApplySubmitPayload } from '../../../../fixtures/applyPayload';
import { createSteamSession } from '../../../../fixtures/steamSession';

function requireEnv(name: string): string {
	const v = process.env[name];
	if (!v) {
		throw new Error(`Missing env var ${name}`);
	}
	return v;
}

async function loadSubmitApiHarness() {
	const { dbOperations } = await import('../../../../fixtures/dbOperations');
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
	const sid = createSteamSession(dbOperations, {
		steamid64: opts.steamid64,
		redirectPath: '/en/apply',
		personaName: 'Test Persona'
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

const hasSteamEnv = Boolean(
	process.env.STEAM_WEB_API_KEY &&
		process.env.TEST_STEAMID64_OWNED &&
		process.env.TEST_STEAMID64_NOT_OWNED
);
const describeSteam = hasSteamEnv ? describe : describe.skip;

describeSteam('Apply workflow: submit route (live Steam via API route)', () => {
	beforeAll(async () => {
		await setupIsolatedDb('triad-tactics-submit-steam-test');
	});

	it('accepts a profile that owns Arma Reforger', async () => {
		process.env.STEAM_WEB_API_KEY = requireEnv('STEAM_WEB_API_KEY');
		const steamid64 = requireEnv('TEST_STEAMID64_OWNED');
		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		dbOperations.deleteBySteamId64(steamid64);

		const res = await postSubmitWithSteamSession({
			steamid64,
			body: buildApplySubmitPayload({ locale: 'en' })
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
			body: buildApplySubmitPayload({ locale: 'en' })
		});
		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json.error).toBe('steam_game_not_detected');
	});

	it('enforces uniqueness per user (second submit is duplicate)', async () => {
		process.env.STEAM_WEB_API_KEY = requireEnv('STEAM_WEB_API_KEY');
		const steamid64 = requireEnv('TEST_STEAMID64_OWNED');
		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		dbOperations.deleteBySteamId64(steamid64);

		const res1 = await postSubmitWithSteamSession({
			steamid64,
			body: buildApplySubmitPayload({ locale: 'en' }),
			ip: '203.0.113.11'
		});
		expect(res1.status).toBe(201);

		const res2 = await postSubmitWithSteamSession({
			steamid64,
			body: buildApplySubmitPayload({ locale: 'en' }),
			ip: '203.0.113.12'
		});
		expect(res2.status).toBe(409);
		const json2 = await res2.json();
		expect(json2.error).toBe('duplicate');
	});

	it('normalizes unsupported locale to en', async () => {
		process.env.STEAM_WEB_API_KEY = requireEnv('STEAM_WEB_API_KEY');
		const steamid64 = requireEnv('TEST_STEAMID64_OWNED');

		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		dbOperations.deleteBySteamId64(steamid64);

		const res = await postSubmitWithSteamSession({
			steamid64,
			body: buildApplySubmitPayload({ locale: 'de' })
		});
		expect(res.status).toBe(201);

		const row = dbOperations.getBySteamId64(steamid64);
		expect(row?.locale).toBe('en');
	});
});
