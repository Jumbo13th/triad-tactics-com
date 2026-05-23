import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../../../fixtures/dbOperations';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';

const ADMIN_STEAM_ID = '76561198012345678';

async function loadHarness() {
	const { dbOperations } = await import('../../../../fixtures/dbOperations');
	const { POST: POST_NOTIFY } = await import('@/app/api/admin/games/[missionId]/notify-discord/route');
	const { POST: POST_PRIORITY_NOTIFY } = await import('@/app/api/admin/games/[missionId]/notify-priority-discord/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, POST_NOTIFY, POST_PRIORITY_NOTIFY, NextRequest };
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
			short_code,
			starts_at,
			description,
			slotting_json,
			created_by_steamid64,
			updated_by_steamid64
		)
		VALUES ('draft', 'Operation Test', 'TST', '2026-03-22T19:30:00.000Z', 'Test description', ?, ?, ?)
	`).run(JSON.stringify({ sides: [] }), ADMIN_STEAM_ID, ADMIN_STEAM_ID);

	const rowId = result.lastInsertRowid;
	return typeof rowId === 'bigint' ? Number(rowId) : rowId;
}

describe('Admin game discord notify endpoints (integration)', () => {
	beforeAll(async () => {
		process.env.DISCORD_BOT_TOKEN = '';
		await setupIsolatedDb({
			prefix: 'triad-tactics-admin-game-discord-notify-test',
			adminSteamIds: ADMIN_STEAM_ID
		});
	});

	beforeEach(async () => {
		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		dbOperations.clearAll();
	});

	it('notify-discord returns 409 when mission is not published (draft)', async () => {
		const { dbOperations, POST_NOTIFY, NextRequest } = await loadHarness();
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});
		const missionId = insertDraftMission();

		const res = await POST_NOTIFY(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/notify-discord`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				}
			}),
			missionContext(missionId)
		);

		expect(res.status).toBe(409);
		const json = await res.json();
		expect(json.error).toBe('not_published');
	});

	it('notify-discord returns 404 when mission does not exist', async () => {
		const { dbOperations, POST_NOTIFY, NextRequest } = await loadHarness();
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const res = await POST_NOTIFY(
			new NextRequest('http://localhost/api/admin/games/99999/notify-discord', {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				}
			}),
			missionContext(99999)
		);

		expect(res.status).toBe(404);
		const json = await res.json();
		expect(json.error).toBe('not_found');
	});

	it('notify-priority-discord returns 409 when mission is not published (draft)', async () => {
		const { dbOperations, POST_PRIORITY_NOTIFY, NextRequest } = await loadHarness();
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});
		const missionId = insertDraftMission();

		const res = await POST_PRIORITY_NOTIFY(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/notify-priority-discord`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				}
			}),
			missionContext(missionId)
		);

		expect(res.status).toBe(409);
		const json = await res.json();
		expect(json.error).toBe('not_published');
	});

	it('notify-priority-discord returns 404 when mission does not exist', async () => {
		const { dbOperations, POST_PRIORITY_NOTIFY, NextRequest } = await loadHarness();
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const res = await POST_PRIORITY_NOTIFY(
			new NextRequest('http://localhost/api/admin/games/99999/notify-priority-discord', {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				}
			}),
			missionContext(99999)
		);

		expect(res.status).toBe(404);
		const json = await res.json();
		expect(json.error).toBe('not_found');
	});
});
