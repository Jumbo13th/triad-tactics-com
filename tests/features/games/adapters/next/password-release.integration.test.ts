import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb, type DbOperations } from '../../../../fixtures/dbOperations';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { buildTestApplicationRecord } from '../../../../fixtures/application';

const ADMIN_STEAM_ID = '76561198099990001';
const UNIT_MEMBER_STEAM_ID = '76561198099990002';
const PRIORITY_PLAYER_STEAM_ID = '76561198099990003';
const REGULAR_PLAYER_STEAM_ID = '76561198099990004';

function createConfirmedPlayer(dbOps: DbOperations, steamId64: string, callsign: string): number {
	const inserted = dbOps.insertApplication(
		buildTestApplicationRecord({ email: `${callsign}-${Date.now()}-${Math.random()}@test.com`, steamid64: steamId64, callsign })
	);
	if (!inserted.success) throw new Error('insert application failed');
	const confirmed = dbOps.confirmApplication(Number(inserted.id), ADMIN_STEAM_ID);
	if (!confirmed.success) throw new Error('confirm application failed');
	const user = dbOps.getUserBySteamId64(steamId64);
	if (!user?.id) throw new Error('user not found after confirm');
	return user.id;
}

function setupMission(dbOps: DbOperations) {
	const db = getDb();

	const slotting = {
		sides: [{
			id: 'side-a', name: 'Alpha', color: '#3B82F6',
			squads: [{
				id: 'sq1', name: 'A-1',
				slots: [
					{ id: 's1', role: 'SL', access: 'unit', occupant: null },
					{ id: 's2', role: 'R1', access: 'priority', occupant: null },
					{ id: 's3', role: 'R2', access: 'regular', occupant: null }
				]
			}]
		}]
	};

	const missionRes = db.prepare(`
		INSERT INTO missions (status, title, description, short_code, slotting_json,
			early_password, final_password, starts_at,
			server_name, server_host, server_port,
			priority_claim_manual_state, created_by_steamid64, updated_by_steamid64, published_at)
		VALUES ('published', 'Test', '', 'pw-test', ?, 'early-pw', 'final-pw', ?,
			'Server', '127.0.0.1', 2001, 'open', ?, ?, CURRENT_TIMESTAMP)
	`).run(JSON.stringify(slotting), new Date(Date.now() + 3600_000).toISOString(), ADMIN_STEAM_ID, ADMIN_STEAM_ID);
	const missionId = Number(missionRes.lastInsertRowid);

	const badgeRes = db.prepare("INSERT INTO badge_types (label, created_by_steamid64) VALUES ('PB', ?)").run(ADMIN_STEAM_ID);
	const badgeId = Number(badgeRes.lastInsertRowid);
	db.prepare("INSERT INTO mission_priority_badges (mission_id, badge_type_id) VALUES (?, ?)").run(missionId, badgeId);

	const unitMemberId = createConfirmedPlayer(dbOps, UNIT_MEMBER_STEAM_ID, 'UnitGuy');
	const priorityPlayerId = createConfirmedPlayer(dbOps, PRIORITY_PLAYER_STEAM_ID, 'PriorityGuy');
	createConfirmedPlayer(dbOps, REGULAR_PLAYER_STEAM_ID, 'RegularGuy');

	db.prepare("INSERT OR IGNORE INTO user_badges (user_id, badge_type_id, assigned_by_steamid64) VALUES (?, ?, ?)").run(priorityPlayerId, badgeId, ADMIN_STEAM_ID);

	const unitRes = db.prepare("INSERT INTO units (name, tag, status, leader_user_id, slots_allocated, created_by_user_id) VALUES ('Team', 'TT', 'verified', ?, 1, ?)").run(unitMemberId, unitMemberId);
	const unitId = Number(unitRes.lastInsertRowid);
	db.prepare("INSERT INTO unit_memberships (unit_id, user_id, role) VALUES (?, ?, 'member')").run(unitId, unitMemberId);
	db.prepare("INSERT INTO mission_unit_assignments (mission_id, unit_id, side_id, episode_number, assigned_by_steamid64) VALUES (?, ?, 'side-a', 1, ?)").run(missionId, unitId, ADMIN_STEAM_ID);

	// Give priority player a claimed slot
	const ep = db.prepare('SELECT slotting_json FROM mission_episode_slotting WHERE mission_id = ? AND episode_number = 1').get(missionId) as { slotting_json: string };
	const epSlotting = JSON.parse(ep.slotting_json);
	epSlotting.sides[0].squads[0].slots[1].occupant = { type: 'user', userId: priorityPlayerId, callsign: 'PriorityGuy', assignedBy: 'self', assignedAt: new Date().toISOString() };
	db.prepare('UPDATE mission_episode_slotting SET slotting_json = ? WHERE mission_id = ? AND episode_number = 1').run(JSON.stringify(epSlotting), missionId);
	db.prepare('UPDATE missions SET slotting_json = ? WHERE id = ?').run(JSON.stringify(epSlotting), missionId);

	return { missionId };
}

async function getPassword(steamId64: string) {
	const { getGameByShortCode } = await import('@/features/games/infra/sqliteGames');
	const result = getGameByShortCode({ shortCode: 'pw-test', steamId64 });
	if (!result.success) throw new Error(`getGameByShortCode failed: ${result.error}`);
	return result.mission.password;
}

describe('Password release flow (integration)', () => {
	let dbOps: DbOperations;

	beforeAll(async () => {
		await setupIsolatedDb({ prefix: 'pw-release', adminSteamIds: ADMIN_STEAM_ID });
	});

	beforeEach(async () => {
		const mod = await import('../../../../fixtures/dbOperations');
		dbOps = mod.dbOperations;
		dbOps.clearAll();
	});

	describe('before any release', () => {
		it('all players see early password', async () => {
			setupMission(dbOps);

			const unitPw = await getPassword(UNIT_MEMBER_STEAM_ID);
			const priorPw = await getPassword(PRIORITY_PLAYER_STEAM_ID);
			const regPw = await getPassword(REGULAR_PLAYER_STEAM_ID);

			expect(unitPw).toMatchObject({ stage: 'early', value: 'early-pw' });
			expect(priorPw.stage).toBe('early');
			expect(regPw.stage).toBe('early');
		});
	});

	describe('after unit release only', () => {
		it('unit member sees final password', async () => {
			const { missionId } = setupMission(dbOps);
			const db = getDb();
			db.prepare("UPDATE missions SET unit_gameplay_released_at = CURRENT_TIMESTAMP, unit_gameplay_ever_released = 1 WHERE id = ?").run(missionId);

			const pw = await getPassword(UNIT_MEMBER_STEAM_ID);
			expect(pw.stage).toBe('final');
			expect(pw.value).toBe('final-pw');
		});

		it('priority player (not unit member) sees waiting', async () => {
			const { missionId } = setupMission(dbOps);
			const db = getDb();
			db.prepare("UPDATE missions SET unit_gameplay_released_at = CURRENT_TIMESTAMP, unit_gameplay_ever_released = 1 WHERE id = ?").run(missionId);

			const pw = await getPassword(PRIORITY_PLAYER_STEAM_ID);
			expect(pw.stage).toBeNull();
			expect(pw.value).toBeNull();
			expect(pw.waitingForViewerAccess).toBe(true);
		});

		it('regular player sees waiting', async () => {
			const { missionId } = setupMission(dbOps);
			const db = getDb();
			db.prepare("UPDATE missions SET unit_gameplay_released_at = CURRENT_TIMESTAMP, unit_gameplay_ever_released = 1 WHERE id = ?").run(missionId);

			const pw = await getPassword(REGULAR_PLAYER_STEAM_ID);
			expect(pw.stage).toBeNull();
			expect(pw.waitingForViewerAccess).toBe(true);
		});

		it('unit member sees early password when final is not set', async () => {
			const { missionId } = setupMission(dbOps);
			const db = getDb();
			db.prepare("UPDATE missions SET final_password = NULL, unit_gameplay_released_at = CURRENT_TIMESTAMP, unit_gameplay_ever_released = 1 WHERE id = ?").run(missionId);

			const pw = await getPassword(UNIT_MEMBER_STEAM_ID);
			expect(pw.stage).toBe('early');
			expect(pw.value).toBe('early-pw');
		});
	});

	describe('after priority release', () => {
		it('priority player sees final password', async () => {
			const { missionId } = setupMission(dbOps);
			const db = getDb();
			db.prepare("UPDATE missions SET unit_gameplay_released_at = CURRENT_TIMESTAMP, unit_gameplay_ever_released = 1, priority_gameplay_released_at = CURRENT_TIMESTAMP, priority_gameplay_ever_released = 1 WHERE id = ?").run(missionId);

			const pw = await getPassword(PRIORITY_PLAYER_STEAM_ID);
			expect(pw.stage).toBe('final');
			expect(pw.value).toBe('final-pw');
		});

		it('unit member still sees final password', async () => {
			const { missionId } = setupMission(dbOps);
			const db = getDb();
			db.prepare("UPDATE missions SET unit_gameplay_released_at = CURRENT_TIMESTAMP, unit_gameplay_ever_released = 1, priority_gameplay_released_at = CURRENT_TIMESTAMP, priority_gameplay_ever_released = 1 WHERE id = ?").run(missionId);

			const pw = await getPassword(UNIT_MEMBER_STEAM_ID);
			expect(pw.stage).toBe('final');
			expect(pw.value).toBe('final-pw');
		});

		it('regular player without slot sees waiting', async () => {
			const { missionId } = setupMission(dbOps);
			const db = getDb();
			db.prepare("UPDATE missions SET unit_gameplay_released_at = CURRENT_TIMESTAMP, unit_gameplay_ever_released = 1, priority_gameplay_released_at = CURRENT_TIMESTAMP, priority_gameplay_ever_released = 1 WHERE id = ?").run(missionId);

			const pw = await getPassword(REGULAR_PLAYER_STEAM_ID);
			expect(pw.stage).toBeNull();
			expect(pw.waitingForViewerAccess).toBe(true);
		});
	});

	describe('priority release without unit release', () => {
		it('priority player sees final password', async () => {
			const { missionId } = setupMission(dbOps);
			const db = getDb();
			db.prepare("UPDATE missions SET priority_gameplay_released_at = CURRENT_TIMESTAMP, priority_gameplay_ever_released = 1 WHERE id = ?").run(missionId);

			const pw = await getPassword(PRIORITY_PLAYER_STEAM_ID);
			expect(pw.stage).toBe('final');
			expect(pw.value).toBe('final-pw');
		});

		it('unit member without priority slot sees waiting', async () => {
			const { missionId } = setupMission(dbOps);
			const db = getDb();
			db.prepare("UPDATE missions SET priority_gameplay_released_at = CURRENT_TIMESTAMP, priority_gameplay_ever_released = 1 WHERE id = ?").run(missionId);

			const pw = await getPassword(UNIT_MEMBER_STEAM_ID);
			expect(pw.stage).toBeNull();
			expect(pw.waitingForViewerAccess).toBe(true);
		});
	});
});
