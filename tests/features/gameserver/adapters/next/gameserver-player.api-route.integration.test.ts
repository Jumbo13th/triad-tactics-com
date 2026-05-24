import { beforeAll, describe, expect, it } from 'vitest';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { buildTestApplicationRecord } from '../../../../fixtures/application';

const ADMIN_STEAM_ID = '76561198012345678';
const USER_STEAM_ID = '76561198000000300';
const GAMESERVER_SECRET = 'test-gameserver-secret-42';
const VALID_GUID = 'a1b2c3d4-5678-9abc-def0-1234567890ab';

async function loadHarness() {
	const { dbOperations, getDb } = await import('../../../../fixtures/dbOperations');
	const { GET } = await import('@/app/api/gameserver/player/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, getDb, GET, NextRequest };
}

function createConfirmedUserWithArmaId(
	dbOperations: Awaited<ReturnType<typeof loadHarness>>['dbOperations'],
	steamid64: string,
	callsign: string,
	armaGuid: string
) {
	const inserted = dbOperations.insertApplication(
		buildTestApplicationRecord({
			email: `${callsign.toLowerCase()}-${crypto.randomUUID()}@example.com`,
			steamid64,
			callsign
		})
	);
	if (!inserted.success) throw new Error('insert failed');
	dbOperations.confirmApplication(Number(inserted.id), ADMIN_STEAM_ID);
	const user = dbOperations.getUserBySteamId64(steamid64);
	if (!user) throw new Error('user not found');
	dbOperations.setArmaGuidByUserId({ userId: user.id, armaGuid });
}

describe('gameserver player lookup (handler integration)', () => {
	beforeAll(async () => {
		process.env.GAMESERVER_API_SECRET = GAMESERVER_SECRET;
		await setupIsolatedDb({
			prefix: 'gameserver-player',
			adminSteamIds: ADMIN_STEAM_ID
		});

		const { dbOperations } = await loadHarness();
		createConfirmedUserWithArmaId(dbOperations, USER_STEAM_ID, 'TestPlayer', VALID_GUID);
	});

	it('returns 401 without secret', async () => {
		const { GET, NextRequest } = await loadHarness();
		const req = new NextRequest(`http://localhost/api/gameserver/player?arma_id=${VALID_GUID}`);
		const res = await GET(req);
		expect(res.status).toBe(401);
	});

	it('returns 400 without arma_id', async () => {
		const { GET, NextRequest } = await loadHarness();
		const req = new NextRequest(`http://localhost/api/gameserver/player?secret=${GAMESERVER_SECRET}`);
		const res = await GET(req);
		expect(res.status).toBe(400);
	});

	it('returns 404 for unknown arma_id', async () => {
		const { GET, NextRequest } = await loadHarness();
		const req = new NextRequest(`http://localhost/api/gameserver/player?secret=${GAMESERVER_SECRET}&arma_id=00000000-0000-0000-0000-000000000000`);
		const res = await GET(req);
		expect(res.status).toBe(404);
	});

	it('returns player data for valid arma_id', async () => {
		const { GET, NextRequest } = await loadHarness();
		const req = new NextRequest(`http://localhost/api/gameserver/player?secret=${GAMESERVER_SECRET}&arma_id=${VALID_GUID}`);
		const res = await GET(req);
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.callsign).toBe('TestPlayer');
		expect(json.arma_id).toBe(VALID_GUID);
		expect(json.steam_id).toBe(USER_STEAM_ID);
	});

	it('does not include site bans in response', async () => {
		const { GET, NextRequest, getDb } = await loadHarness();
		const db = getDb();

		const user = db.prepare(`SELECT id FROM users WHERE current_callsign = ?`).get('TestPlayer') as { id: number };

		// Insert a site_ban and a server_ban
		db.prepare(`
			INSERT INTO sanctions (user_id, type, reason, expires_at, created_by_steamid64, auto_generated)
			VALUES (?, 'site_ban', 'Site ban reason', datetime('now', '+7 days'), ?, 0)
		`).run(user.id, ADMIN_STEAM_ID);

		db.prepare(`
			INSERT INTO sanctions (user_id, type, reason, expires_at, created_by_steamid64, auto_generated)
			VALUES (?, 'server_ban', 'Server ban reason', datetime('now', '+7 days'), ?, 0)
		`).run(user.id, ADMIN_STEAM_ID);

		const req = new NextRequest(`http://localhost/api/gameserver/player?secret=${GAMESERVER_SECRET}&arma_id=${VALID_GUID}`);
		const res = await GET(req);
		expect(res.status).toBe(200);
		const json = await res.json();

		expect(json.active_bans).toHaveLength(1);
		expect(json.active_bans[0].type).toBe('server_ban');
		expect(json.active_bans[0].reason).toBe('Server ban reason');
		expect(json.active_bans.every((b: { type: string }) => b.type !== 'site_ban')).toBe(true);
	});
});
