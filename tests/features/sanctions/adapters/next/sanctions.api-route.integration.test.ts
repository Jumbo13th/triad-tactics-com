import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApplicationRecord } from '../../../../fixtures/application';
import { getDb } from '../../../../fixtures/dbOperations';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';

const ADMIN_STEAM_ID = '76561198012345678';
const USER_STEAM_ID = '76561198099999999';

async function loadHarness() {
	const { dbOperations } = await import('../../../../fixtures/dbOperations');
	const { GET: GET_ADMIN_SANCTIONS, POST: POST_ADMIN_SANCTIONS } = await import('@/app/api/admin/sanctions/route');
	const { POST: POST_CANCEL } = await import('@/app/api/admin/sanctions/[sanctionId]/cancel/route');
	const { POST: POST_EXPIRY } = await import('@/app/api/admin/sanctions/[sanctionId]/expiry/route');
	const { GET: GET_PUBLIC } = await import('@/app/api/sanctions/route');
	const { GET: GET_USER } = await import('@/app/api/me/sanctions/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, GET_ADMIN_SANCTIONS, POST_ADMIN_SANCTIONS, POST_CANCEL, POST_EXPIRY, GET_PUBLIC, GET_USER, NextRequest };
}

function cancelContext(sanctionId: number | string) {
	return { params: Promise.resolve({ sanctionId: String(sanctionId) }) };
}

async function createConfirmedUser(steamId64: string, callsign: string): Promise<number> {
	const { dbOperations } = await import('../../../../fixtures/dbOperations');
	const app = buildTestApplicationRecord({ email: `${callsign}@test.com`, steamid64: steamId64, callsign });
	const inserted = dbOperations.insertApplication(app);
	if (!inserted.success) throw new Error('Failed to insert application');
	dbOperations.confirmApplication(Number(inserted.id), ADMIN_STEAM_ID);
	const user = dbOperations.getUserBySteamId64(steamId64);
	if (!user) throw new Error('User not found after confirmation');
	dbOperations.setArmaGuidByUserId({ userId: user.id, armaGuid: `test-guid-${steamId64}` });
	return user.id;
}

function adminRequest(NextRequest: typeof import('next/server').NextRequest, url: string, opts: { method?: string; body?: unknown; adminSid: string }) {
	const headers: Record<string, string> = {
		cookie: `tt_steam_session=${opts.adminSid}`,
		origin: 'http://localhost'
	};
	if (opts.body !== undefined) {
		headers['content-type'] = 'application/json';
	}
	return new NextRequest(url, {
		method: opts.method ?? 'GET',
		headers,
		body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
	});
}

describe('Sanctions API routes (integration)', () => {
	beforeAll(async () => {
		process.env.DISCORD_BOT_TOKEN = '';
		await setupIsolatedDb({
			prefix: 'triad-tactics-sanctions-test',
			adminSteamIds: ADMIN_STEAM_ID
		});
	});

	beforeEach(async () => {
		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		dbOperations.clearAll();
	});

	describe('admin create', () => {
		it('creates a strike for a user', async () => {
			const { dbOperations, POST_ADMIN_SANCTIONS, NextRequest } = await loadHarness();
			const adminSid = createSteamSession(dbOperations, { steamid64: ADMIN_STEAM_ID });
			const userId = await createConfirmedUser(USER_STEAM_ID, 'TestPlayer');

			const res = await POST_ADMIN_SANCTIONS(adminRequest(NextRequest, 'http://localhost/api/admin/sanctions', {
				method: 'POST',
				adminSid,
				body: { userId, type: 'strike', reason: 'First warning', durationMinutes: null }
			}));

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.success).toBe(true);
			expect(json.autoEscalation).toBe(false);
		});

		it('creates a timed site ban', async () => {
			const { dbOperations, POST_ADMIN_SANCTIONS, NextRequest } = await loadHarness();
			const adminSid = createSteamSession(dbOperations, { steamid64: ADMIN_STEAM_ID });
			const userId = await createConfirmedUser(USER_STEAM_ID, 'TestPlayer');

			const res = await POST_ADMIN_SANCTIONS(adminRequest(NextRequest, 'http://localhost/api/admin/sanctions', {
				method: 'POST',
				adminSid,
				body: { userId, type: 'site_ban', reason: 'Abuse', durationMinutes: 1440 }
			}));

			expect(res.status).toBe(200);
			expect((await res.json()).success).toBe(true);
		});

		it('creates a permanent server ban', async () => {
			const { dbOperations, POST_ADMIN_SANCTIONS, NextRequest } = await loadHarness();
			const adminSid = createSteamSession(dbOperations, { steamid64: ADMIN_STEAM_ID });
			const userId = await createConfirmedUser(USER_STEAM_ID, 'TestPlayer');

			const res = await POST_ADMIN_SANCTIONS(adminRequest(NextRequest, 'http://localhost/api/admin/sanctions', {
				method: 'POST',
				adminSid,
				body: { userId, type: 'server_ban', reason: 'Cheating', durationMinutes: null }
			}));

			expect(res.status).toBe(200);
			expect((await res.json()).success).toBe(true);

			const row = getDb().prepare('SELECT * FROM sanctions WHERE user_id = ?').get(userId) as { type: string; expires_at: string | null };
			expect(row.type).toBe('server_ban');
			expect(row.expires_at).toBeNull();
		});

		it('rejects missing reason', async () => {
			const { dbOperations, POST_ADMIN_SANCTIONS, NextRequest } = await loadHarness();
			const adminSid = createSteamSession(dbOperations, { steamid64: ADMIN_STEAM_ID });
			const userId = await createConfirmedUser(USER_STEAM_ID, 'TestPlayer');

			const res = await POST_ADMIN_SANCTIONS(adminRequest(NextRequest, 'http://localhost/api/admin/sanctions', {
				method: 'POST',
				adminSid,
				body: { userId, type: 'strike', durationMinutes: null }
			}));

			expect(res.status).toBe(400);
		});

		it('rejects invalid sanction type', async () => {
			const { dbOperations, POST_ADMIN_SANCTIONS, NextRequest } = await loadHarness();
			const adminSid = createSteamSession(dbOperations, { steamid64: ADMIN_STEAM_ID });
			const userId = await createConfirmedUser(USER_STEAM_ID, 'TestPlayer');

			const res = await POST_ADMIN_SANCTIONS(adminRequest(NextRequest, 'http://localhost/api/admin/sanctions', {
				method: 'POST',
				adminSid,
				body: { userId, type: 'invalid_type', reason: 'test', durationMinutes: null }
			}));

			expect(res.status).toBe(400);
		});

		it('rejects non-admin user', async () => {
			const { dbOperations, POST_ADMIN_SANCTIONS, NextRequest } = await loadHarness();
			const userSid = createSteamSession(dbOperations, { steamid64: USER_STEAM_ID });

			const res = await POST_ADMIN_SANCTIONS(adminRequest(NextRequest, 'http://localhost/api/admin/sanctions', {
				method: 'POST',
				adminSid: userSid,
				body: { userId: 1, type: 'strike', reason: 'test', durationMinutes: null }
			}));

			expect(res.status).toBe(403);
		});
	});

	describe('admin list', () => {
		it('lists sanctions with counts', async () => {
			const { dbOperations, GET_ADMIN_SANCTIONS, POST_ADMIN_SANCTIONS, NextRequest } = await loadHarness();
			const adminSid = createSteamSession(dbOperations, { steamid64: ADMIN_STEAM_ID });
			const userId = await createConfirmedUser(USER_STEAM_ID, 'TestPlayer');

			await POST_ADMIN_SANCTIONS(adminRequest(NextRequest, 'http://localhost/api/admin/sanctions', {
				method: 'POST', adminSid,
				body: { userId, type: 'strike', reason: 'Warning 1', durationMinutes: null }
			}));
			await POST_ADMIN_SANCTIONS(adminRequest(NextRequest, 'http://localhost/api/admin/sanctions', {
				method: 'POST', adminSid,
				body: { userId, type: 'site_ban', reason: 'Ban', durationMinutes: 1440 }
			}));

			const res = await GET_ADMIN_SANCTIONS(adminRequest(NextRequest, 'http://localhost/api/admin/sanctions?page=1', { adminSid }));
			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.success).toBe(true);
			expect(json.total).toBe(2);
			expect(json.counts.strike).toBe(1);
			expect(json.counts.site_ban).toBe(1);
			expect(json.counts.server_ban).toBe(0);
		});

		it('filters by type', async () => {
			const { dbOperations, GET_ADMIN_SANCTIONS, POST_ADMIN_SANCTIONS, NextRequest } = await loadHarness();
			const adminSid = createSteamSession(dbOperations, { steamid64: ADMIN_STEAM_ID });
			const userId = await createConfirmedUser(USER_STEAM_ID, 'TestPlayer');

			await POST_ADMIN_SANCTIONS(adminRequest(NextRequest, 'http://localhost/api/admin/sanctions', {
				method: 'POST', adminSid,
				body: { userId, type: 'strike', reason: 'Warning', durationMinutes: null }
			}));
			await POST_ADMIN_SANCTIONS(adminRequest(NextRequest, 'http://localhost/api/admin/sanctions', {
				method: 'POST', adminSid,
				body: { userId, type: 'site_ban', reason: 'Ban', durationMinutes: 1440 }
			}));

			const res = await GET_ADMIN_SANCTIONS(adminRequest(NextRequest, 'http://localhost/api/admin/sanctions?page=1&type=strike', { adminSid }));
			const json = await res.json();
			expect(json.sanctions).toHaveLength(1);
			expect(json.sanctions[0].type).toBe('strike');
		});
	});

	describe('admin cancel', () => {
		it('cancels an active sanction', async () => {
			const { dbOperations, POST_ADMIN_SANCTIONS, POST_CANCEL, NextRequest } = await loadHarness();
			const adminSid = createSteamSession(dbOperations, { steamid64: ADMIN_STEAM_ID });
			const userId = await createConfirmedUser(USER_STEAM_ID, 'TestPlayer');

			await POST_ADMIN_SANCTIONS(adminRequest(NextRequest, 'http://localhost/api/admin/sanctions', {
				method: 'POST', adminSid,
				body: { userId, type: 'site_ban', reason: 'Temp ban', durationMinutes: 1440 }
			}));

			const sanction = getDb().prepare('SELECT id FROM sanctions WHERE user_id = ?').get(userId) as { id: number };

			const res = await POST_CANCEL(
				adminRequest(NextRequest, `http://localhost/api/admin/sanctions/${sanction.id}/cancel`, {
					method: 'POST', adminSid,
					body: { reason: 'Appealed successfully' }
				}),
				cancelContext(sanction.id)
			);

			expect(res.status).toBe(200);
			expect((await res.json()).success).toBe(true);

			const row = getDb().prepare('SELECT cancelled_at, cancelled_reason FROM sanctions WHERE id = ?').get(sanction.id) as { cancelled_at: string | null; cancelled_reason: string | null };
			expect(row.cancelled_at).not.toBeNull();
			expect(row.cancelled_reason).toBe('Appealed successfully');
		});

		it('rejects cancel without reason', async () => {
			const { dbOperations, POST_ADMIN_SANCTIONS, POST_CANCEL, NextRequest } = await loadHarness();
			const adminSid = createSteamSession(dbOperations, { steamid64: ADMIN_STEAM_ID });
			const userId = await createConfirmedUser(USER_STEAM_ID, 'TestPlayer');

			await POST_ADMIN_SANCTIONS(adminRequest(NextRequest, 'http://localhost/api/admin/sanctions', {
				method: 'POST', adminSid,
				body: { userId, type: 'strike', reason: 'test', durationMinutes: null }
			}));

			const sanction = getDb().prepare('SELECT id FROM sanctions WHERE user_id = ?').get(userId) as { id: number };

			const res = await POST_CANCEL(
				adminRequest(NextRequest, `http://localhost/api/admin/sanctions/${sanction.id}/cancel`, {
					method: 'POST', adminSid,
					body: { reason: '' }
				}),
				cancelContext(sanction.id)
			);

			expect(res.status).toBe(400);
		});
	});

	describe('admin update expiry', () => {
		it('updates expiry of an active sanction', async () => {
			const { dbOperations, POST_ADMIN_SANCTIONS, POST_EXPIRY, NextRequest } = await loadHarness();
			const adminSid = createSteamSession(dbOperations, { steamid64: ADMIN_STEAM_ID });
			const userId = await createConfirmedUser(USER_STEAM_ID, 'TestPlayer');

			await POST_ADMIN_SANCTIONS(adminRequest(NextRequest, 'http://localhost/api/admin/sanctions', {
				method: 'POST', adminSid,
				body: { userId, type: 'site_ban', reason: 'Ban', durationMinutes: 1440 }
			}));

			const sanction = getDb().prepare('SELECT id FROM sanctions WHERE user_id = ?').get(userId) as { id: number };
			const newExpiry = '2099-12-31 23:59:59';

			const res = await POST_EXPIRY(
				adminRequest(NextRequest, `http://localhost/api/admin/sanctions/${sanction.id}/expiry`, {
					method: 'POST', adminSid,
					body: { expiresAt: newExpiry }
				}),
				cancelContext(sanction.id)
			);

			expect(res.status).toBe(200);
			expect((await res.json()).success).toBe(true);

			const row = getDb().prepare('SELECT expires_at, original_expires_at FROM sanctions WHERE id = ?').get(sanction.id) as { expires_at: string; original_expires_at: string };
			expect(row.expires_at).toBe(newExpiry);
			expect(row.original_expires_at).not.toBeNull();
		});

		it('makes a ban permanent', async () => {
			const { dbOperations, POST_ADMIN_SANCTIONS, POST_EXPIRY, NextRequest } = await loadHarness();
			const adminSid = createSteamSession(dbOperations, { steamid64: ADMIN_STEAM_ID });
			const userId = await createConfirmedUser(USER_STEAM_ID, 'TestPlayer');

			await POST_ADMIN_SANCTIONS(adminRequest(NextRequest, 'http://localhost/api/admin/sanctions', {
				method: 'POST', adminSid,
				body: { userId, type: 'site_ban', reason: 'Ban', durationMinutes: 1440 }
			}));

			const sanction = getDb().prepare('SELECT id FROM sanctions WHERE user_id = ?').get(userId) as { id: number };

			const res = await POST_EXPIRY(
				adminRequest(NextRequest, `http://localhost/api/admin/sanctions/${sanction.id}/expiry`, {
					method: 'POST', adminSid,
					body: { expiresAt: null }
				}),
				cancelContext(sanction.id)
			);

			expect(res.status).toBe(200);
			const row = getDb().prepare('SELECT expires_at FROM sanctions WHERE id = ?').get(sanction.id) as { expires_at: string | null };
			expect(row.expires_at).toBeNull();
		});

		it('rejects expiry in the past', async () => {
			const { dbOperations, POST_ADMIN_SANCTIONS, POST_EXPIRY, NextRequest } = await loadHarness();
			const adminSid = createSteamSession(dbOperations, { steamid64: ADMIN_STEAM_ID });
			const userId = await createConfirmedUser(USER_STEAM_ID, 'TestPlayer');

			await POST_ADMIN_SANCTIONS(adminRequest(NextRequest, 'http://localhost/api/admin/sanctions', {
				method: 'POST', adminSid,
				body: { userId, type: 'site_ban', reason: 'Ban', durationMinutes: 1440 }
			}));

			const sanction = getDb().prepare('SELECT id FROM sanctions WHERE user_id = ?').get(userId) as { id: number };

			const res = await POST_EXPIRY(
				adminRequest(NextRequest, `http://localhost/api/admin/sanctions/${sanction.id}/expiry`, {
					method: 'POST', adminSid,
					body: { expiresAt: '2020-01-01 00:00:00' }
				}),
				cancelContext(sanction.id)
			);

			expect(res.status).toBe(400);
			expect((await res.json()).error).toBe('expires_in_past');
		});
	});

	describe('strike escalation', () => {
		it('auto-escalates to server ban after 3 strikes', async () => {
			const { dbOperations, POST_ADMIN_SANCTIONS, NextRequest } = await loadHarness();
			const adminSid = createSteamSession(dbOperations, { steamid64: ADMIN_STEAM_ID });
			const userId = await createConfirmedUser(USER_STEAM_ID, 'TestPlayer');

			for (let i = 1; i <= 3; i++) {
				await POST_ADMIN_SANCTIONS(adminRequest(NextRequest, 'http://localhost/api/admin/sanctions', {
					method: 'POST', adminSid,
					body: { userId, type: 'strike', reason: `Warning ${i}`, durationMinutes: null }
				}));
			}

			const thirdRes = getDb().prepare(
				"SELECT * FROM sanctions WHERE user_id = ? AND type = 'server_ban' AND auto_generated = 1"
			).get(userId);
			expect(thirdRes).toBeTruthy();

			const cancelledStrikes = getDb().prepare(
				"SELECT COUNT(*) AS cnt FROM sanctions WHERE user_id = ? AND type = 'strike' AND cancelled_at IS NOT NULL"
			).get(userId) as { cnt: number };
			expect(cancelledStrikes.cnt).toBe(3);
		});
	});

	describe('public sanctions', () => {
		it('returns public sanctions list', async () => {
			const { dbOperations, POST_ADMIN_SANCTIONS, GET_PUBLIC, NextRequest } = await loadHarness();
			const adminSid = createSteamSession(dbOperations, { steamid64: ADMIN_STEAM_ID });
			const userId = await createConfirmedUser(USER_STEAM_ID, 'TestPlayer');

			await POST_ADMIN_SANCTIONS(adminRequest(NextRequest, 'http://localhost/api/admin/sanctions', {
				method: 'POST', adminSid,
				body: { userId, type: 'strike', reason: 'Warning', durationMinutes: null }
			}));

			const res = await GET_PUBLIC(new NextRequest('http://localhost/api/sanctions?page=1'));
			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.success).toBe(true);
			expect(json.sanctions.length).toBeGreaterThanOrEqual(1);
			expect(json.sanctions[0].callsign).toBe('TestPlayer');
		});
	});

	describe('user sanctions', () => {
		it('returns sanctions for authenticated user', async () => {
			const { dbOperations, POST_ADMIN_SANCTIONS, GET_USER, NextRequest } = await loadHarness();
			const adminSid = createSteamSession(dbOperations, { steamid64: ADMIN_STEAM_ID });
			const userId = await createConfirmedUser(USER_STEAM_ID, 'TestPlayer');
			const userSid = createSteamSession(dbOperations, { steamid64: USER_STEAM_ID });

			await POST_ADMIN_SANCTIONS(adminRequest(NextRequest, 'http://localhost/api/admin/sanctions', {
				method: 'POST', adminSid,
				body: { userId, type: 'site_ban', reason: 'Bad behavior', durationMinutes: 1440 }
			}));

			const res = await GET_USER(new NextRequest('http://localhost/api/me/sanctions', {
				headers: { cookie: `tt_steam_session=${userSid}` }
			}));

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.success).toBe(true);
			expect(json.sanctions).toHaveLength(1);
			expect(json.sanctions[0].type).toBe('site_ban');
		});

		it('returns 401 for unauthenticated user', async () => {
			const { GET_USER, NextRequest } = await loadHarness();

			const res = await GET_USER(new NextRequest('http://localhost/api/me/sanctions'));
			expect(res.status).toBe(401);
		});

		it('returns empty array for user with no sanctions', async () => {
			const { dbOperations, GET_USER, NextRequest } = await loadHarness();
			await createConfirmedUser(USER_STEAM_ID, 'CleanPlayer');
			const userSid = createSteamSession(dbOperations, { steamid64: USER_STEAM_ID });

			const res = await GET_USER(new NextRequest('http://localhost/api/me/sanctions', {
				headers: { cookie: `tt_steam_session=${userSid}` }
			}));

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.sanctions).toHaveLength(0);
		});
	});
});
