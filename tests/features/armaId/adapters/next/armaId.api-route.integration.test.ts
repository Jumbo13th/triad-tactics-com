import { beforeAll, describe, expect, it } from 'vitest';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';
import { buildTestApplicationRecord } from '../../../../fixtures/application';

const ADMIN_STEAM_ID = '76561198012345678';
const USER_STEAM_ID = '76561198000000100';
const USER2_STEAM_ID = '76561198000000200';
const VALID_GUID = 'a1b2c3d4-5678-9abc-def0-1234567890ab';
const VALID_GUID_2 = 'b2c3d4e5-6789-abcd-ef01-234567890abc';

async function loadHarness() {
	const { dbOperations } = await import('../../../../fixtures/dbOperations');
	const { POST } = await import('@/app/api/arma-id/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, POST, NextRequest };
}

function createConfirmedUser(
	dbOperations: Awaited<ReturnType<typeof loadHarness>>['dbOperations'],
	steamid64: string,
	callsign: string
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
}

describe('arma-id API route (handler integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({
			prefix: 'arma-id-route',
			adminSteamIds: ADMIN_STEAM_ID
		});

		const { dbOperations } = await loadHarness();
		createConfirmedUser(dbOperations, USER_STEAM_ID, 'ArmaTestUser');
		createConfirmedUser(dbOperations, USER2_STEAM_ID, 'ArmaTestUser2');
	});

	it('returns 401 when not authenticated', async () => {
		const { POST, NextRequest } = await loadHarness();
		const req = new NextRequest('http://localhost/api/arma-id', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ armaGuid: VALID_GUID })
		});
		const res = await POST(req);
		expect(res.status).toBe(401);
	});

	it('returns 400 for invalid GUID format', async () => {
		const { dbOperations, POST, NextRequest } = await loadHarness();
		const sid = createSteamSession(dbOperations, { steamid64: USER_STEAM_ID });
		const req = new NextRequest('http://localhost/api/arma-id', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: `tt_steam_session=${sid}`
			},
			body: JSON.stringify({ armaGuid: 'not-a-valid-uuid' })
		});
		const res = await POST(req);
		expect(res.status).toBe(400);
	});

	it('saves a valid GUID for an authenticated user', async () => {
		const { dbOperations, POST, NextRequest } = await loadHarness();
		const sid = createSteamSession(dbOperations, { steamid64: USER_STEAM_ID });
		const req = new NextRequest('http://localhost/api/arma-id', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: `tt_steam_session=${sid}`
			},
			body: JSON.stringify({ armaGuid: VALID_GUID })
		});
		const res = await POST(req);
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.ok).toBe(true);
	});

	it('returns 409 for a duplicate GUID', async () => {
		const { dbOperations, POST, NextRequest } = await loadHarness();
		const sid = createSteamSession(dbOperations, { steamid64: USER2_STEAM_ID });
		const req = new NextRequest('http://localhost/api/arma-id', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: `tt_steam_session=${sid}`
			},
			body: JSON.stringify({ armaGuid: VALID_GUID })
		});
		const res = await POST(req);
		expect(res.status).toBe(409);
		const json = await res.json();
		expect(json.error).toBe('duplicate');
	});

	it('allows updating to a different GUID', async () => {
		const { dbOperations, POST, NextRequest } = await loadHarness();
		const sid = createSteamSession(dbOperations, { steamid64: USER_STEAM_ID });
		const req = new NextRequest('http://localhost/api/arma-id', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: `tt_steam_session=${sid}`
			},
			body: JSON.stringify({ armaGuid: VALID_GUID_2 })
		});
		const res = await POST(req);
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.ok).toBe(true);
	});
});
