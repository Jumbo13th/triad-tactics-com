import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApplicationRecord } from '../../../fixtures/application';
import { getDb, dbOperations } from '../../../fixtures/dbOperations';
import { setupIsolatedDb } from '../../../fixtures/isolatedDb';

const ADMIN_STEAM_ID = '76561198012345678';
const PLAYER_STEAM_ID = '76561198087654321';

function slottingWithOccupant(userId: number | null) {
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
						slots: [
							{
								id: 'slot-squad',
								role: 'Squad Leader',
								access: 'unit',
								occupant: { type: 'placeholder', label: 'Alpha Squad' }
							},
							{
								id: 'slot-priority',
								role: 'Machine Gunner',
								access: 'priority',
								occupant:
									typeof userId === 'number'
										? {
											type: 'user',
											userId,
											callsign: 'Occupied',
											assignedBy: 'self',
											assignedAt: '2026-03-10T10:00:00.000Z'
										}
										: null
							}
						]
					}
				]
			}
		]
	};
}

function insertMission(opts: {
	shortCode: string;
	status: 'published' | 'archived';
	archiveStatus?: 'completed' | 'canceled';
	slotting: unknown;
}): number {
	const db = getDb();
	const result = db.prepare(`
		INSERT INTO missions (
			short_code,
			status,
			title,
			description,
			slotting_json,
			archive_status,
			created_by_steamid64,
			updated_by_steamid64
		)
		VALUES (?, ?, 'Operation', '', ?, ?, ?, ?)
	`).run(
		opts.shortCode,
		opts.status,
		JSON.stringify(opts.slotting),
		opts.archiveStatus ?? null,
		ADMIN_STEAM_ID,
		ADMIN_STEAM_ID
	);

	const rowId = result.lastInsertRowid;
	return typeof rowId === 'bigint' ? Number(rowId) : rowId;
}

function insertRegularJoin(missionId: number, userId: number, steamId64: string) {
	getDb().prepare(`
		INSERT INTO mission_regular_joins (mission_id, user_id, joined_by_steamid64)
		VALUES (?, ?, ?)
	`).run(missionId, userId, steamId64);
}

function createConfirmedPlayer(input: { steamId64: string; callsign: string }): { userId: number } {
	const inserted = dbOperations.insertApplication(
		buildTestApplicationRecord({
			email: `${input.callsign}-${crypto.randomUUID()}@example.com`,
			steamid64: input.steamId64,
			callsign: input.callsign
		})
	);
	expect(inserted.success).toBe(true);
	if (!inserted.success) {
		throw new Error('Expected application insert to succeed');
	}

	const confirmed = dbOperations.confirmApplication(Number(inserted.id), ADMIN_STEAM_ID);
	expect(confirmed.success).toBe(true);

	const user = dbOperations.getUserBySteamId64(input.steamId64);
	if (!user?.id) {
		throw new Error('Expected confirmed user to exist');
	}

	return { userId: user.id };
}

describe('countCompletedGameParticipations (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({
			prefix: 'triad-tactics-participation-count-test',
			adminSteamIds: ADMIN_STEAM_ID
		});
	});

	beforeEach(() => {
		dbOperations.clearAll();
	});

	it('counts only completed archived games the player took part in', async () => {
		const { countCompletedGameParticipations } = await import('@/features/games/infra/sqliteGamesStats');
		const player = createConfirmedPlayer({ steamId64: PLAYER_STEAM_ID, callsign: 'Newcomer' });

		// Counts: held a slot in a completed archived game
		insertMission({
			shortCode: 'A-1',
			status: 'archived',
			archiveStatus: 'completed',
			slotting: slottingWithOccupant(player.userId)
		});

		// Counts: regular join in a completed archived game
		const joinedMission = insertMission({
			shortCode: 'A-2',
			status: 'archived',
			archiveStatus: 'completed',
			slotting: slottingWithOccupant(null)
		});
		insertRegularJoin(joinedMission, player.userId, PLAYER_STEAM_ID);

		// Counts once: both a slot and a regular join in the same game
		const doubleMission = insertMission({
			shortCode: 'A-3',
			status: 'archived',
			archiveStatus: 'completed',
			slotting: slottingWithOccupant(player.userId)
		});
		insertRegularJoin(doubleMission, player.userId, PLAYER_STEAM_ID);

		// Does not count: completed game without the player
		insertMission({
			shortCode: 'A-4',
			status: 'archived',
			archiveStatus: 'completed',
			slotting: slottingWithOccupant(null)
		});

		// Does not count: canceled game with the player slotted
		insertMission({
			shortCode: 'A-5',
			status: 'archived',
			archiveStatus: 'canceled',
			slotting: slottingWithOccupant(player.userId)
		});

		// Does not count: still-published game with the player slotted
		insertMission({
			shortCode: 'P-1',
			status: 'published',
			slotting: slottingWithOccupant(player.userId)
		});

		expect(countCompletedGameParticipations({ steamId64: PLAYER_STEAM_ID })).toBe(3);
	});

	it('returns 0 for an unknown steam id', async () => {
		const { countCompletedGameParticipations } = await import('@/features/games/infra/sqliteGamesStats');
		expect(countCompletedGameParticipations({ steamId64: '76561198000000000' })).toBe(0);
	});

	it('does not count another player\'s slots', async () => {
		const { countCompletedGameParticipations } = await import('@/features/games/infra/sqliteGamesStats');
		const player = createConfirmedPlayer({ steamId64: PLAYER_STEAM_ID, callsign: 'Newcomer' });
		const other = createConfirmedPlayer({ steamId64: '76561198011111111', callsign: 'Veteran' });

		insertMission({
			shortCode: 'A-1',
			status: 'archived',
			archiveStatus: 'completed',
			slotting: slottingWithOccupant(other.userId)
		});

		expect(countCompletedGameParticipations({ steamId64: PLAYER_STEAM_ID })).toBe(0);
		expect(player.userId).not.toBe(other.userId);
	});
});

function insertUnit(createdByUserId: number): number {
	const db = getDb();
	const result = db.prepare(`
		INSERT INTO units (name, tag, created_by_user_id)
		VALUES (?, ?, ?)
	`).run(`Unit-${crypto.randomUUID()}`, `TAG${Math.floor(Math.random() * 100000)}`, createdByUserId);

	const rowId = result.lastInsertRowid;
	return typeof rowId === 'bigint' ? Number(rowId) : rowId;
}

function insertUnitMembership(unitId: number, userId: number, role: 'member' | 'applicant' | 'deputy' | 'leader') {
	getDb().prepare(`
		INSERT INTO unit_memberships (unit_id, user_id, role)
		VALUES (?, ?, ?)
	`).run(unitId, userId, role);
}

function insertUserBadge(userId: number) {
	const db = getDb();
	const badge = db.prepare(`
		INSERT INTO badge_types (label, created_by_steamid64, updated_by_steamid64)
		VALUES (?, ?, ?)
	`).run(`Badge-${crypto.randomUUID()}`, ADMIN_STEAM_ID, ADMIN_STEAM_ID);
	const badgeTypeId = typeof badge.lastInsertRowid === 'bigint' ? Number(badge.lastInsertRowid) : badge.lastInsertRowid;

	db.prepare(`
		INSERT INTO user_badges (user_id, badge_type_id, assigned_by_steamid64)
		VALUES (?, ?, ?)
	`).run(userId, badgeTypeId, ADMIN_STEAM_ID);
}

describe('userIsInSquadOrHasBadge (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({
			prefix: 'triad-tactics-squad-badge-test',
			adminSteamIds: ADMIN_STEAM_ID
		});
	});

	beforeEach(() => {
		dbOperations.clearAll();
	});

	it('is true for an accepted squad member', async () => {
		const { userIsInSquadOrHasBadge } = await import('@/features/games/infra/sqliteGamesStats');
		const player = createConfirmedPlayer({ steamId64: PLAYER_STEAM_ID, callsign: 'SquadGuy' });

		const unitId = insertUnit(player.userId);
		insertUnitMembership(unitId, player.userId, 'member');

		expect(userIsInSquadOrHasBadge({ steamId64: PLAYER_STEAM_ID })).toBe(true);
	});

	it('is true for a squad leader and deputy', async () => {
		const { userIsInSquadOrHasBadge } = await import('@/features/games/infra/sqliteGamesStats');
		const leader = createConfirmedPlayer({ steamId64: PLAYER_STEAM_ID, callsign: 'Leader' });
		const deputy = createConfirmedPlayer({ steamId64: '76561198011111111', callsign: 'Deputy' });

		const unitId = insertUnit(leader.userId);
		insertUnitMembership(unitId, leader.userId, 'leader');
		insertUnitMembership(unitId, deputy.userId, 'deputy');

		expect(userIsInSquadOrHasBadge({ steamId64: PLAYER_STEAM_ID })).toBe(true);
		expect(userIsInSquadOrHasBadge({ steamId64: '76561198011111111' })).toBe(true);
	});

	it('is false for a squad applicant', async () => {
		const { userIsInSquadOrHasBadge } = await import('@/features/games/infra/sqliteGamesStats');
		const owner = createConfirmedPlayer({ steamId64: '76561198011111111', callsign: 'Owner' });
		const applicant = createConfirmedPlayer({ steamId64: PLAYER_STEAM_ID, callsign: 'Applicant' });

		const unitId = insertUnit(owner.userId);
		insertUnitMembership(unitId, applicant.userId, 'applicant');

		expect(userIsInSquadOrHasBadge({ steamId64: PLAYER_STEAM_ID })).toBe(false);
	});

	it('is true for a badge holder without a squad', async () => {
		const { userIsInSquadOrHasBadge } = await import('@/features/games/infra/sqliteGamesStats');
		const player = createConfirmedPlayer({ steamId64: PLAYER_STEAM_ID, callsign: 'Decorated' });

		insertUserBadge(player.userId);

		expect(userIsInSquadOrHasBadge({ steamId64: PLAYER_STEAM_ID })).toBe(true);
	});

	it('is false without squad or badges, and for an unknown steam id', async () => {
		const { userIsInSquadOrHasBadge } = await import('@/features/games/infra/sqliteGamesStats');
		createConfirmedPlayer({ steamId64: PLAYER_STEAM_ID, callsign: 'Plain' });

		expect(userIsInSquadOrHasBadge({ steamId64: PLAYER_STEAM_ID })).toBe(false);
		expect(userIsInSquadOrHasBadge({ steamId64: '76561198000000000' })).toBe(false);
	});
});

describe('getIsEstablishedPlayer (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({
			prefix: 'triad-tactics-established-player-test',
			adminSteamIds: ADMIN_STEAM_ID
		});
	});

	beforeEach(() => {
		dbOperations.clearAll();
	});

	async function loadUseCase() {
		const { getIsEstablishedPlayer } = await import('@/features/games/useCases/getIsEstablishedPlayer');
		const { getIsEstablishedPlayerDeps } = await import('@/features/games/deps');
		return (steamId64: string) => getIsEstablishedPlayer(getIsEstablishedPlayerDeps, steamId64);
	}

	it('is true for a badge holder even with zero completed games', async () => {
		const isEstablished = await loadUseCase();
		const player = createConfirmedPlayer({ steamId64: PLAYER_STEAM_ID, callsign: 'Decorated' });

		insertUserBadge(player.userId);

		expect(isEstablished(PLAYER_STEAM_ID)).toBe(true);
	});

	it('is true after reaching the completed-games threshold without squad or badge', async () => {
		const isEstablished = await loadUseCase();
		const player = createConfirmedPlayer({ steamId64: PLAYER_STEAM_ID, callsign: 'Veteran' });

		for (const shortCode of ['A-1', 'A-2', 'A-3']) {
			insertMission({
				shortCode,
				status: 'archived',
				archiveStatus: 'completed',
				slotting: slottingWithOccupant(player.userId)
			});
		}

		expect(isEstablished(PLAYER_STEAM_ID)).toBe(true);
	});

	it('is false below the threshold without squad or badge', async () => {
		const isEstablished = await loadUseCase();
		const player = createConfirmedPlayer({ steamId64: PLAYER_STEAM_ID, callsign: 'Newcomer' });

		for (const shortCode of ['A-1', 'A-2']) {
			insertMission({
				shortCode,
				status: 'archived',
				archiveStatus: 'completed',
				slotting: slottingWithOccupant(player.userId)
			});
		}

		expect(isEstablished(PLAYER_STEAM_ID)).toBe(false);
	});
});
