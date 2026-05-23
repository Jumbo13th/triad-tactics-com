import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../../../fixtures/dbOperations';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';

const ADMIN_STEAM_ID = '76561198012345678';

async function loadHarness() {
	const { dbOperations } = await import('../../../../fixtures/dbOperations');
	const { POST } = await import('@/app/api/admin/badges/[badgeTypeId]/discord-role/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, POST, NextRequest };
}

function badgeContext(badgeTypeId: number | string) {
	return {
		params: Promise.resolve({ badgeTypeId: String(badgeTypeId) })
	};
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

describe('Admin badge discord-role endpoint (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({
			prefix: 'triad-tactics-badge-discord-role-test',
			adminSteamIds: ADMIN_STEAM_ID
		});
	});

	beforeEach(async () => {
		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		dbOperations.clearAll();
	});

	it('updates discord_role_id on a badge type', async () => {
		const { dbOperations, POST, NextRequest } = await loadHarness();
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/badges'
		});
		const badgeTypeId = insertBadgeType('Recon');

		const res = await POST(
			new NextRequest(`http://localhost/api/admin/badges/${badgeTypeId}/discord-role`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ discordRoleId: '123456789012345678' })
			}),
			badgeContext(badgeTypeId)
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.badge.discord_role_id).toBe('123456789012345678');

		const row = getDb()
			.prepare('SELECT discord_role_id FROM badge_types WHERE id = ?')
			.get(badgeTypeId) as { discord_role_id: string | null };
		expect(row.discord_role_id).toBe('123456789012345678');
	});

	it('clears discord_role_id when null is sent', async () => {
		const { dbOperations, POST, NextRequest } = await loadHarness();
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/badges'
		});
		const badgeTypeId = insertBadgeType('Medic');

		// First set it
		await POST(
			new NextRequest(`http://localhost/api/admin/badges/${badgeTypeId}/discord-role`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ discordRoleId: '999888777666555444' })
			}),
			badgeContext(badgeTypeId)
		);

		// Then clear it
		const res = await POST(
			new NextRequest(`http://localhost/api/admin/badges/${badgeTypeId}/discord-role`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ discordRoleId: null })
			}),
			badgeContext(badgeTypeId)
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.badge.discord_role_id).toBeNull();

		const row = getDb()
			.prepare('SELECT discord_role_id FROM badge_types WHERE id = ?')
			.get(badgeTypeId) as { discord_role_id: string | null };
		expect(row.discord_role_id).toBeNull();
	});

	it('returns 400 for invalid badgeTypeId', async () => {
		const { dbOperations, POST, NextRequest } = await loadHarness();
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/badges'
		});

		const res = await POST(
			new NextRequest('http://localhost/api/admin/badges/abc/discord-role', {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ discordRoleId: '123456789012345678' })
			}),
			badgeContext('abc')
		);

		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json.error).toBe('validation_error');
	});

	it('returns success with the updated badge', async () => {
		const { dbOperations, POST, NextRequest } = await loadHarness();
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/badges'
		});
		const badgeTypeId = insertBadgeType('Pilot');

		const res = await POST(
			new NextRequest(`http://localhost/api/admin/badges/${badgeTypeId}/discord-role`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ discordRoleId: '111222333444555666' })
			}),
			badgeContext(badgeTypeId)
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.badge).toBeDefined();
		expect(json.badge.label).toBe('Pilot');
		expect(json.badge.discord_role_id).toBe('111222333444555666');
	});
});
