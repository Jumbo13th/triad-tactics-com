import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../../../fixtures/dbOperations';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';

const ADMIN_STEAM_ID = '76561198012345678';

async function loadAdminGameSlottingHarness() {
	const { dbOperations } = await import('../../../../fixtures/dbOperations');
	const { PUT } = await import('@/app/api/admin/games/[missionId]/slotting/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, PUT, NextRequest };
}

function missionRouteContext(missionId: number | string) {
	return {
		params: Promise.resolve({ missionId: String(missionId) })
	};
}

function createUnitOnlySlotting() {
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
								id: 'slot-mg',
								role: 'Machine Gunner',
								access: 'unit',
								occupant: null
							},
							{
								id: 'slot-rifle',
								role: 'Rifleman',
								access: 'unit',
								occupant: null
							}
						]
					}
				]
			}
		]
	};
}

function createEpisodeSlottingWithUser() {
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
								id: 'slot-mg',
								role: 'priority',
								access: 'priority',
								occupant: {
									type: 'user',
									userId: 44,
									callsign: 'Nomad',
									assignedBy: 'self',
									assignedAt: '2026-03-10T10:00:00.000Z'
								}
							},
							{
								id: 'slot-rifle',
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
}

function insertMission(opts: {
	status?: 'draft' | 'published';
	slotting: unknown;
	episodeSlotting?: unknown;
	regularJoinEnabled?: boolean;
}): number {
	const db = getDb();
	const slottingJson = JSON.stringify(opts.slotting);
	const result = db.prepare(`
		INSERT INTO missions (
			status,
			title,
			description,
			regular_join_enabled,
			slotting_json,
			created_by_steamid64,
			updated_by_steamid64,
			published_at,
			published_by_steamid64
		)
		VALUES (?, '', '', ?, ?, ?, ?, ?, ?)
	`).run(
		opts.status ?? 'draft',
		opts.regularJoinEnabled ? 1 : 0,
		slottingJson,
		ADMIN_STEAM_ID,
		ADMIN_STEAM_ID,
		opts.status === 'published' ? '2026-03-10T10:00:00.000Z' : null,
		opts.status === 'published' ? ADMIN_STEAM_ID : null
	);

	const rowId = result.lastInsertRowid;
	const missionId = typeof rowId === 'bigint' ? Number(rowId) : rowId;

	if (opts.episodeSlotting) {
		db.prepare(`
			UPDATE mission_episode_slotting
			SET slotting_json = ?
			WHERE mission_id = ? AND episode_number = 1
		`).run(JSON.stringify(opts.episodeSlotting), missionId);
	}

	return missionId;
}

describe('Admin game slotting endpoints (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({
			prefix: 'triad-tactics-admin-game-slotting-test',
			adminSteamIds: ADMIN_STEAM_ID
		});
	});

	beforeEach(async () => {
		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		dbOperations.clearAll();
	});

	it('updates canonical slotting and increments the slotting revision', async () => {
		const { dbOperations, PUT, NextRequest } = await loadAdminGameSlottingHarness();
		const missionId = insertMission({ status: 'draft', slotting: createUnitOnlySlotting() });
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const nextSlotting = {
			sides: [
				{
					id: 'usk',
					name: 'USK',
					color: '#1D4ED8',
					squads: [
						{
							id: 'usk-1-1',
							name: '1-1',
							slots: [
								{
									id: 'slot-squad',
									role: 'Squad Leader',
									access: 'unit',
									occupant: { type: 'placeholder', label: 'Bravo Squad' }
								},
								{
									id: 'slot-mg',
									role: 'Autorifleman',
									access: 'unit',
									occupant: null
								},
								{
									id: 'slot-rifle',
									role: 'Rifleman',
									access: 'unit',
									occupant: null
								}
							]
						}
					]
				}
			]
		};

		const res = await PUT(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/slotting`, {
				method: 'PUT',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ slottingRevision: 1, slotting: nextSlotting })
			}),
			missionRouteContext(missionId)
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.mission.episodeSlottings[0].slottingRevision).toBe(2);
		expect(json.mission.episodeSlottings[0].slotting.sides[0].color).toBe('#1D4ED8');
		expect(json.mission.episodeSlottings[0].slotting.sides[0].squads[0].slots[1].role).toBe('Autorifleman');
	});

	it('rejects stale slotting revisions', async () => {
		const { dbOperations, PUT, NextRequest } = await loadAdminGameSlottingHarness();
		const missionId = insertMission({ status: 'draft', slotting: createUnitOnlySlotting() });
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const res = await PUT(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/slotting`, {
				method: 'PUT',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({
					slottingRevision: 99,
					slotting: createUnitOnlySlotting()
				})
			}),
			missionRouteContext(missionId)
		);

		expect(res.status).toBe(409);
		const json = await res.json();
		expect(json.error).toBe('slotting_revision_conflict');
	});

	it('requires confirmation before destructive published slotting edits', async () => {
		const { dbOperations, PUT, NextRequest } = await loadAdminGameSlottingHarness();
		const missionId = insertMission({
			status: 'published',
			regularJoinEnabled: true,
			slotting: createUnitOnlySlotting(),
			episodeSlotting: createEpisodeSlottingWithUser()
		});
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const destructiveSlotting = {
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
									occupant: null
								},
								{
									id: 'slot-rifle',
									role: 'Rifleman',
									access: 'unit',
									occupant: null
								}
							]
						}
					]
				}
			]
		};

		const res = await PUT(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/slotting`, {
				method: 'PUT',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ slottingRevision: 1, slotting: destructiveSlotting })
			}),
			missionRouteContext(missionId)
		);

		expect(res.status).toBe(409);
		const json = await res.json();
		expect(json.error).toBe('destructive_change_requires_confirmation');
		expect(json.destructiveChanges).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ reason: 'occupied_slot_removed', slotId: 'slot-mg' })
			])
		);
	});

	it('rejects non-unit access slots when mission is in draft', async () => {
		const { dbOperations, PUT, NextRequest } = await loadAdminGameSlottingHarness();
		const missionId = insertMission({ status: 'draft', slotting: createUnitOnlySlotting() });
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const mixedAccessSlotting = {
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
									occupant: null
								},
								{
									id: 'slot-mg',
									role: 'Machine Gunner',
									access: 'priority',
									occupant: null
								},
								{
									id: 'slot-rifle',
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

		const res = await PUT(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/slotting`, {
				method: 'PUT',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ slottingRevision: 1, slotting: mixedAccessSlotting })
			}),
			missionRouteContext(missionId)
		);

		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json.error).toBe('slotting_invalid');
	});

	it('allows non-unit access slots when mission is published', async () => {
		const { dbOperations, PUT, NextRequest } = await loadAdminGameSlottingHarness();
		const missionId = insertMission({
			status: 'published',
			regularJoinEnabled: true,
			slotting: createUnitOnlySlotting(),
			episodeSlotting: createEpisodeSlottingWithUser()
		});
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const mixedAccessSlotting = {
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
									id: 'slot-mg',
									role: 'Machine Gunner',
									access: 'priority',
									occupant: null
								},
								{
									id: 'slot-rifle',
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

		const res = await PUT(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/slotting`, {
				method: 'PUT',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({
					slottingRevision: 1,
					slotting: mixedAccessSlotting,
					confirmDestructive: true
				})
			}),
			missionRouteContext(missionId)
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.mission.episodeSlottings[0].slotting.sides[0].squads[0].slots[1].access).toBe('priority');
		expect(json.mission.episodeSlottings[0].slotting.sides[0].squads[0].slots[2].access).toBe('regular');
	});

	it('allows destructive published slotting edits after explicit confirmation', async () => {
		const { dbOperations, PUT, NextRequest } = await loadAdminGameSlottingHarness();
		const missionId = insertMission({
			status: 'published',
			regularJoinEnabled: true,
			slotting: createUnitOnlySlotting(),
			episodeSlotting: createEpisodeSlottingWithUser()
		});
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const destructiveSlotting = {
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
									occupant: null
								},
								{
									id: 'slot-rifle',
									role: 'Rifleman',
									access: 'unit',
									occupant: null
								}
							]
						}
					]
				}
			]
		};

		const res = await PUT(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/slotting`, {
				method: 'PUT',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({
					slottingRevision: 1,
					slotting: destructiveSlotting,
					confirmDestructive: true
				})
			}),
			missionRouteContext(missionId)
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.mission.episodeSlottings[0].slottingRevision).toBe(2);
		expect(json.mission.episodeSlottings[0].slotting.sides[0].squads[0].slots).toHaveLength(2);
	});

});
