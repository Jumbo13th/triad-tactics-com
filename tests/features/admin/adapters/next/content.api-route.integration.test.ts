import { beforeAll, describe, expect, it } from 'vitest';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';
import { getDb } from '../../../../fixtures/dbOperations';

async function loadAdminContentHarness() {
	const { dbOperations } = await import('../../../../fixtures/dbOperations');
	const { GET, PUT } = await import('@/app/api/admin/content/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, GET, PUT, NextRequest };
}

describe('Admin content endpoints (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({
			prefix: 'triad-tactics-admin-content-test',
			adminSteamIds: '76561198012345678'
		});
	});

	it('validates content payload', async () => {
		const { dbOperations, PUT, NextRequest } = await loadAdminContentHarness();
		const adminSid = createSteamSession(dbOperations, {
			steamid64: '76561198012345678',
			redirectPath: '/en/admin/content'
		});

		const res = await PUT(
			new NextRequest('http://localhost/api/admin/content', {
				method: 'PUT',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({
					upcomingGames: {
						enabled: true,
						startsAt: null,
						text: { en: 'Test', ru: 'Test', uk: 'Test' }
					}
				})
			})
		);

		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json.error).toBe('validation_error');
	});

	it('saves content and records updated_by', async () => {
		const { dbOperations, GET, PUT, NextRequest } = await loadAdminContentHarness();
		const adminSteamId = '76561198012345678';
		const adminSid = createSteamSession(dbOperations, {
			steamid64: adminSteamId,
			redirectPath: '/en/admin/content'
		});

		const payload = {
			upcomingGames: {
				enabled: true,
				startsAt: '2026-02-08T16:30:00.000Z',
				text: {
					en: 'Next op is locked in.',
					ru: 'Next op confirmed (ru).',
					uk: 'Next op confirmed (uk).',
					ar: 'Next op confirmed (ar).'
				}
			}
		};

		const putRes = await PUT(
			new NextRequest('http://localhost/api/admin/content', {
				method: 'PUT',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify(payload)
			})
		);

		expect(putRes.status).toBe(200);
		const putJson = await putRes.json();
		expect(putJson.success).toBe(true);
		expect(putJson.upcomingGames.enabled).toBe(true);

		const getRes = await GET(
			new NextRequest('http://localhost/api/admin/content', {
				method: 'GET',
				headers: { cookie: `tt_steam_session=${adminSid}` }
			})
		);

		expect(getRes.status).toBe(200);
		const getJson = await getRes.json();
		expect(getJson.success).toBe(true);
		expect(getJson.upcomingGames.text.en).toBe(payload.upcomingGames.text.en);

		const db = getDb();
		const row = db
			.prepare('SELECT updated_by FROM content_settings WHERE key = ? LIMIT 1')
			.get('content_upcoming_games_enabled') as { updated_by?: string | null } | undefined;
		expect(row?.updated_by).toBe(adminSteamId);
	});
});
