import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../../../fixtures/dbOperations';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';

const ADMIN_STEAM_ID = '76561198012345678';

async function loadAdminGameLifecycleHarness() {
	const { dbOperations } = await import('../../../../fixtures/dbOperations');
	const { PUT } = await import('@/app/api/admin/games/[missionId]/settings/route');
	const { POST } = await import('@/app/api/admin/games/[missionId]/publish/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, PUT, POST, NextRequest };
}

function missionRouteContext(missionId: number | string) {
	return {
		params: Promise.resolve({ missionId: String(missionId) })
	};
}

function createSlottingShape(opts: { includePriority?: boolean; includeRegular?: boolean }) {
	const slots: Array<Record<string, unknown>> = [
		{
			id: 'slot-squad-lead',
			role: 'Squad Leader',
			access: 'unit',
			occupant: { type: 'placeholder', label: 'Alpha Squad' }
		}
	];

	if (opts.includePriority) {
		slots.push({
			id: 'slot-priority',
			role: 'Machine Gunner',
			access: 'priority',
			occupant: null
		});
	}

	if (opts.includeRegular) {
		slots.push({
			id: 'slot-regular',
			role: 'Rifleman',
			access: 'regular',
			occupant: null
		});
	}

	return {
		sides: [
			{
				id: 'usk',
				name: 'USK',
				color: '#3B82F6',
				squads: [
					{
						id: 'usk-1-1',
						name: '1-1',
						slots
					}
				]
			}
		]
	};
}

function insertDraftMission(slotting: unknown): number {
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
		VALUES ('draft', '', '', ?, ?, ?)
	`).run(JSON.stringify(slotting), ADMIN_STEAM_ID, ADMIN_STEAM_ID);

	const rowId = result.lastInsertRowid;
	return typeof rowId === 'bigint' ? Number(rowId) : rowId;
}

function insertBadgeType(label: string): number {
	const db = getDb();
	const result = db.prepare(`
		INSERT INTO badge_types (label, created_by_steamid64, updated_by_steamid64)
		VALUES (?, ?, ?)
	`).run(label, ADMIN_STEAM_ID, ADMIN_STEAM_ID);

	const rowId = result.lastInsertRowid;
	return typeof rowId === 'bigint' ? Number(rowId) : rowId;
}

describe('Admin game lifecycle endpoints (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({
			prefix: 'triad-tactics-admin-game-lifecycle-test',
			adminSteamIds: ADMIN_STEAM_ID
		});
	});

	beforeEach(async () => {
		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		dbOperations.clearAll();
	});

	it('updates draft settings and persists passwords', async () => {
		const { dbOperations, PUT, NextRequest } = await loadAdminGameLifecycleHarness();
		const missionId = insertDraftMission(createSlottingShape({ includePriority: true, includeRegular: true }));
		const badgeId = insertBadgeType('Recon');
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const res = await PUT(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/settings`, {
				method: 'PUT',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({
					settingsRevision: 1,
					title: 'Operation Dawn',
						description: { en: 'Secure the valley.', ru: '', uk: '', ar: '' },
					shortCode: 'OP-DAWN',
					startsAt: '2026-03-20T19:00:00.000Z',
					serverName: 'Triad Server',
					serverHost: '203.0.113.40',
					serverPort: 2001,
					earlyPassword: 'mods-pass',
					finalPassword: 'live-pass',
					priorityClaimOpensAt: '2026-03-20T18:00:00.000Z',
					priorityClaimManualState: 'default',
					unitSlottingManualState: 'open',
					regularJoinEnabled: true,
					serverDetailsHidden: false,
					priorityBadgeTypeIds: [badgeId]
				})
			}),
			missionRouteContext(missionId)
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.mission.title).toBe('Operation Dawn');
		expect(json.mission.shortCode).toBe('OP-DAWN');
		expect(json.mission.settingsRevision).toBe(2);
		expect(json.mission.earlyPassword).toBe('mods-pass');
		expect(json.mission.finalPassword).toBe('live-pass');
		expect(json.mission.regularJoinEnabled).toBe(true);
		expect(json.mission.priorityBadgeTypeIds).toEqual([badgeId]);

		const db = getDb();
		const row = db
			.prepare(
				'SELECT early_password, final_password FROM missions WHERE id = ? LIMIT 1'
			)
			.get(missionId) as { early_password: string | null; final_password: string | null };
		expect(row.early_password).toBe('mods-pass');
		expect(row.final_password).toBe('live-pass');
	});

	it('rejects stale settings revisions', async () => {
		const { dbOperations, PUT, NextRequest } = await loadAdminGameLifecycleHarness();
		const missionId = insertDraftMission(createSlottingShape({ includeRegular: true }));
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const res = await PUT(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/settings`, {
				method: 'PUT',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({
					settingsRevision: 99,
					title: 'Outdated edit',
						description: { en: '', ru: '', uk: '', ar: '' },
					shortCode: null,
					startsAt: null,
					serverName: '',
					serverHost: '',
					serverPort: null,
					priorityClaimOpensAt: null,
					priorityClaimManualState: 'default',
					unitSlottingManualState: 'open',
					regularJoinEnabled: false,
					serverDetailsHidden: false,
					priorityBadgeTypeIds: []
				})
			}),
			missionRouteContext(missionId)
		);

		expect(res.status).toBe(409);
		const json = await res.json();
		expect(json.error).toBe('settings_revision_conflict');
	});

	it('returns detailed validation errors for invalid settings payloads', async () => {
		const { dbOperations, PUT, NextRequest } = await loadAdminGameLifecycleHarness();
		const missionId = insertDraftMission(createSlottingShape({ includeRegular: true }));
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const res = await PUT(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/settings`, {
				method: 'PUT',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({
					settingsRevision: 1,
					title: 'Invalid Port',
						description: { en: '', ru: '', uk: '', ar: '' },
					shortCode: 'OP-BAD-PORT',
					startsAt: '2026-03-22T19:30:00.000Z',
					serverName: 'Triad Server',
					serverHost: '198.51.100.25',
					serverPort: 70000,
					priorityClaimOpensAt: null,
					priorityClaimManualState: 'default',
					unitSlottingManualState: 'open',
					regularJoinEnabled: true,
					serverDetailsHidden: false,
					priorityBadgeTypeIds: []
				})
			}),
			missionRouteContext(missionId)
		);

		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json.error).toBe('validation_error');
		expect(json.details).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'too_big',
					path: ['serverPort'],
					maximum: 65535
				})
			])
		);
	});

	it('returns publish validation reasons when the draft is incomplete', async () => {
		const { dbOperations, POST, NextRequest } = await loadAdminGameLifecycleHarness();
		const missionId = insertDraftMission(createSlottingShape({ includePriority: true }));
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const res = await POST(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/publish`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ settingsRevision: 1 })
			}),
			missionRouteContext(missionId)
		);

		expect(res.status).toBe(409);
		const json = await res.json();
		expect(json.error).toBe('publish_validation_failed');
		expect(json.reasons).toEqual(
			expect.arrayContaining([
				'short_code_required',
				'starts_at_required',
				'server_name_required',
				'server_host_required',
				'server_port_required',
				'early_password_required',
				'priority_badge_required'
			])
		);
	});

	it('publishes a valid draft and locks the short code afterwards', async () => {
		const { dbOperations, PUT, POST, NextRequest } = await loadAdminGameLifecycleHarness();
		const missionId = insertDraftMission(createSlottingShape({ includePriority: true, includeRegular: true }));
		const badgeId = insertBadgeType('Veteran');
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const settingsRes = await PUT(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/settings`, {
				method: 'PUT',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({
					settingsRevision: 1,
					title: 'Operation Locked Code',
						description: { en: 'Final publish candidate.', ru: '', uk: '', ar: '' },
					shortCode: 'OP-LOCK',
					startsAt: '2026-03-22T19:30:00.000Z',
					serverName: 'Triad Server',
					serverHost: '198.51.100.25',
					serverPort: 2001,
					earlyPassword: 'briefing',
					priorityClaimOpensAt: null,
					priorityClaimManualState: 'default',
					unitSlottingManualState: 'open',
					regularJoinEnabled: true,
					serverDetailsHidden: false,
					priorityBadgeTypeIds: [badgeId]
				})
			}),
			missionRouteContext(missionId)
		);
		expect(settingsRes.status).toBe(200);

		const publishRes = await POST(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/publish`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ settingsRevision: 2 })
			}),
			missionRouteContext(missionId)
		);

		expect(publishRes.status).toBe(200);
		const publishJson = await publishRes.json();
		expect(publishJson.success).toBe(true);
		expect(publishJson.mission.status).toBe('published');
		expect(publishJson.mission.shortCode).toBe('OP-LOCK');
		expect(publishJson.mission.settingsRevision).toBe(3);
		expect(publishJson.mission.publishedAt).not.toBeNull();

		const lockedRes = await PUT(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/settings`, {
				method: 'PUT',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({
					settingsRevision: 3,
					title: 'Operation Locked Code',
						description: { en: 'Final publish candidate.', ru: '', uk: '', ar: '' },
					shortCode: 'OP-CHANGED',
					startsAt: '2026-03-22T19:30:00.000Z',
					serverName: 'Triad Server',
					serverHost: '198.51.100.25',
					serverPort: 2001,
					priorityClaimOpensAt: null,
					priorityClaimManualState: 'default',
					unitSlottingManualState: 'open',
					regularJoinEnabled: true,
					serverDetailsHidden: false,
					priorityBadgeTypeIds: [badgeId]
				})
			}),
			missionRouteContext(missionId)
		);

		expect(lockedRes.status).toBe(409);
		const lockedJson = await lockedRes.json();
		expect(lockedJson.error).toBe('short_code_locked');
	});
});
