import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../../../fixtures/dbOperations';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';

const ADMIN_STEAM_ID = '76561198012345678';

const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

async function loadHarness() {
	const { dbOperations } = await import('../../../../fixtures/dbOperations');
	const { GET, POST, DELETE } = await import('@/app/api/admin/games/[missionId]/image/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, GET, POST, DELETE, NextRequest };
}

function missionContext(missionId: number | string) {
	return {
		params: Promise.resolve({ missionId: String(missionId) })
	};
}

function insertDraftMission(): number {
	const db = getDb();
	const result = db.prepare(`
		INSERT INTO missions (
			status,
			title,
			description,
			slotting_json,
			created_by_steamid64,
			updated_by_steamid64
		)
		VALUES ('draft', 'Test Mission', 'A test', ?, ?, ?)
	`).run(JSON.stringify({ sides: [] }), ADMIN_STEAM_ID, ADMIN_STEAM_ID);

	const rowId = result.lastInsertRowid;
	return typeof rowId === 'bigint' ? Number(rowId) : rowId;
}

describe('Admin game image endpoints (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({
			prefix: 'triad-tactics-admin-game-image-test',
			adminSteamIds: ADMIN_STEAM_ID
		});
	});

	beforeEach(async () => {
		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		dbOperations.clearAll();
	});

	it('uploads an image via POST and retrieves it via GET', async () => {
		const { dbOperations, GET, POST, NextRequest } = await loadHarness();
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});
		const missionId = insertDraftMission();

		const uploadRes = await POST(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/image`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ data: TINY_PNG_BASE64, mime: 'image/png' })
			}),
			missionContext(missionId)
		);

		expect(uploadRes.status).toBe(200);
		const uploadJson = await uploadRes.json();
		expect(uploadJson.success).toBe(true);

		// Retrieve it
		const getRes = await GET(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/image`, {
				method: 'GET',
				headers: {
					cookie: `tt_steam_session=${adminSid}`
				}
			}),
			missionContext(missionId)
		);

		expect(getRes.status).toBe(200);
		expect(getRes.headers.get('Content-Type')).toBe('image/png');

		const buffer = Buffer.from(await getRes.arrayBuffer());
		const expectedBuffer = Buffer.from(TINY_PNG_BASE64, 'base64');
		expect(buffer.equals(expectedBuffer)).toBe(true);
	});

	it('deletes an uploaded image via DELETE', async () => {
		const { dbOperations, GET, POST, DELETE, NextRequest } = await loadHarness();
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});
		const missionId = insertDraftMission();

		// Upload first
		await POST(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/image`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ data: TINY_PNG_BASE64, mime: 'image/png' })
			}),
			missionContext(missionId)
		);

		// Delete
		const deleteRes = await DELETE(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/image`, {
				method: 'DELETE',
				headers: {
					origin: 'http://localhost',
					cookie: `tt_steam_session=${adminSid}`
				}
			}),
			missionContext(missionId)
		);

		expect(deleteRes.status).toBe(200);
		const deleteJson = await deleteRes.json();
		expect(deleteJson.success).toBe(true);

		// Verify it's gone
		const getRes = await GET(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/image`, {
				method: 'GET',
				headers: {
					cookie: `tt_steam_session=${adminSid}`
				}
			}),
			missionContext(missionId)
		);

		expect(getRes.status).toBe(404);
	});

	it('returns 404 when no image exists for GET', async () => {
		const { dbOperations, GET, NextRequest } = await loadHarness();
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});
		const missionId = insertDraftMission();

		const res = await GET(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/image`, {
				method: 'GET',
				headers: {
					cookie: `tt_steam_session=${adminSid}`
				}
			}),
			missionContext(missionId)
		);

		expect(res.status).toBe(404);
	});
});
