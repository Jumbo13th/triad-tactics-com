import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../../../fixtures/dbOperations';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';

const ADMIN_STEAM_ID = '76561198012345678';

async function loadHarness() {
	const { dbOperations } = await import('../../../../fixtures/dbOperations');
	const { PUT } = await import('@/app/api/admin/games/[missionId]/settings/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, PUT, NextRequest };
}

function missionContext(missionId: number | string) {
	return {
		params: Promise.resolve({ missionId: String(missionId) })
	};
}

function insertDraftMission(): number {
	const db = getDb();
	const slotting = {
		sides: [
			{
				id: 'usk',
				name: 'USK',
				color: '#3B82F6',
				squads: [
					{
						id: 'usk-1-1',
						name: '1-1',
						slots: [
							{
								id: 'slot-regular',
								role: 'Rifleman',
								access: 'regular',
								occupant: null
							}
						]
					}
				]
			}
		]
	};

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

function makeSettingsPayload(overrides: Record<string, unknown> = {}) {
	return {
		settingsRevision: 1,
		title: 'Operation Priority Test',
		description: { en: 'Test', ru: '', uk: '', ar: '' },
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
		priorityBadgeTypeIds: [],
		skipPriorityDiscord: false,
		...overrides
	};
}

describe('Admin game priority discord flag (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({
			prefix: 'triad-tactics-admin-game-priority-discord-test',
			adminSteamIds: ADMIN_STEAM_ID
		});
	});

	beforeEach(async () => {
		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		dbOperations.clearAll();
	});

	it('saves skipPriorityDiscord=true and it persists', async () => {
		const { dbOperations, PUT, NextRequest } = await loadHarness();
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});
		const missionId = insertDraftMission();

		const res = await PUT(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/settings`, {
				method: 'PUT',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify(makeSettingsPayload({ skipPriorityDiscord: true }))
			}),
			missionContext(missionId)
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.mission.skipPriorityDiscord).toBe(true);

		const row = getDb()
			.prepare('SELECT skip_priority_discord FROM missions WHERE id = ?')
			.get(missionId) as { skip_priority_discord: number };
		expect(row.skip_priority_discord).toBe(1);
	});

	it('resets priority_discord_sent when priorityClaimManualState changes', async () => {
		const { dbOperations, PUT, NextRequest } = await loadHarness();
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});
		const missionId = insertDraftMission();

		// First set priority_discord_sent = 1 manually to simulate a sent notification
		getDb().prepare('UPDATE missions SET priority_discord_sent = 1 WHERE id = ?').run(missionId);

		// Now change priorityClaimManualState from default -> open
		const res = await PUT(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/settings`, {
				method: 'PUT',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify(makeSettingsPayload({ priorityClaimManualState: 'open' }))
			}),
			missionContext(missionId)
		);

		expect(res.status).toBe(200);

		const row = getDb()
			.prepare('SELECT priority_discord_sent FROM missions WHERE id = ?')
			.get(missionId) as { priority_discord_sent: number };
		expect(row.priority_discord_sent).toBe(0);
	});

	it('resets priority_discord_sent when priorityClaimOpensAt changes', async () => {
		const { dbOperations, PUT, NextRequest } = await loadHarness();
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});
		const missionId = insertDraftMission();

		// Set priority_discord_sent = 1 manually
		getDb().prepare('UPDATE missions SET priority_discord_sent = 1 WHERE id = ?').run(missionId);

		// Now change priorityClaimOpensAt
		const res = await PUT(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/settings`, {
				method: 'PUT',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify(makeSettingsPayload({ priorityClaimOpensAt: '2026-03-20T18:00:00.000Z' }))
			}),
			missionContext(missionId)
		);

		expect(res.status).toBe(200);

		const row = getDb()
			.prepare('SELECT priority_discord_sent FROM missions WHERE id = ?')
			.get(missionId) as { priority_discord_sent: number };
		expect(row.priority_discord_sent).toBe(0);
	});

	it('claimPendingPriorityDiscordNotifications returns ready missions and marks them as sent', async () => {
		const db = getDb();

		// Insert a published mission with priority_claim_manual_state = 'open',
		// priority_discord_sent = 0, skip_priority_discord = 0
		db.prepare(`
			INSERT INTO missions (
				status, title, short_code, starts_at, description, slotting_json,
				priority_claim_manual_state, priority_discord_sent, skip_priority_discord,
				created_by_steamid64, updated_by_steamid64
			) VALUES (
				'published', 'Test', 'TST', '2026-03-22T19:30:00.000Z', '', ?,
				'open', 0, 0, ?, ?
			)
		`).run(JSON.stringify({ sides: [] }), ADMIN_STEAM_ID, ADMIN_STEAM_ID);

		const { claimPendingPriorityDiscordNotifications } = await import(
			'@/features/games/infra/sqliteGames'
		);

		const pending = claimPendingPriorityDiscordNotifications();

		expect(pending).toHaveLength(1);
		expect(pending[0].title).toBe('Test');
		expect(pending[0].shortCode).toBe('TST');
		expect(pending[0].startsAt).toBe('2026-03-22T19:30:00.000Z');
		expect(Array.isArray(pending[0].discordRoleIds)).toBe(true);

		// Verify it was marked as sent
		const row = db
			.prepare('SELECT priority_discord_sent FROM missions WHERE short_code = ?')
			.get('TST') as { priority_discord_sent: number };
		expect(row.priority_discord_sent).toBe(1);

		// Calling again should return empty
		const secondCall = claimPendingPriorityDiscordNotifications();
		expect(secondCall).toHaveLength(0);
	});
});
