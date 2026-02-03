import { beforeAll, describe, expect, it, vi } from 'vitest';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';

async function loadAdminMailingHarness() {
	const { dbOperations } = await import('../../../../fixtures/dbOperations');
	const { POST } = await import('@/app/api/admin/mailing/route');
	const { GET: GET_CONFIG } = await import('@/app/api/admin/config/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, POST, GET_CONFIG, NextRequest };
}

describe('Admin mailing endpoints (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({
			prefix: 'triad-tactics-admin-mailing-test',
			adminSteamIds: '76561198012345678'
		});
	});

	it('validates mailing payload', async () => {
		const { dbOperations, POST, NextRequest } = await loadAdminMailingHarness();
		const adminSid = createSteamSession(dbOperations, {
			steamid64: '76561198012345678',
			redirectPath: '/en/admin'
		});

		const res = await POST(
			new NextRequest('http://localhost/api/admin/mailing', {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({
					applicationIds: [1],
					subjectEn: 'Hello',
					bodyEn: 'Body',
					subjectRu: '',
					bodyRu: 'Body'
				})
			})
		);

		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json.error).toBe('validation_error');
	});

	it('returns success for a valid mailing payload', async () => {
		const { dbOperations, POST, NextRequest } = await loadAdminMailingHarness();
		const adminSid = createSteamSession(dbOperations, {
			steamid64: '76561198012345678',
			redirectPath: '/en/admin'
		});

		const res = await POST(
			new NextRequest('http://localhost/api/admin/mailing', {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({
					applicationIds: [1],
					subjectEn: 'Hello {name}',
					bodyEn: 'Hi {name}',
					subjectRu: 'Привет {name}',
					bodyRu: 'Привет {name}'
				})
			})
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.total).toBe(0);
		expect(json.queued).toBe(0);
	});

	it('returns only mailing config values', async () => {
		process.env.BREVO_SENDER_EMAIL = 'sender@example.com';
		process.env.BREVO_SENDER_NAME = 'Triad Tactics';
		process.env.BREVO_REPLY_TO_EMAIL = 'reply@example.com';
		vi.resetModules();

		const { dbOperations, GET_CONFIG, NextRequest } = await loadAdminMailingHarness();
		const adminSid = createSteamSession(dbOperations, {
			steamid64: '76561198012345678',
			redirectPath: '/en/admin'
		});

		const res = await GET_CONFIG(
			new NextRequest('http://localhost/api/admin/config', {
				method: 'GET',
				headers: {
					cookie: `tt_steam_session=${adminSid}`
				}
			})
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.config).toEqual([
			{ key: 'BREVO_SENDER_EMAIL', value: 'sender@example.com' },
			{ key: 'BREVO_SENDER_NAME', value: 'Triad Tactics' },
			{ key: 'BREVO_REPLY_TO_EMAIL', value: 'reply@example.com' }
		]);
	});
});
