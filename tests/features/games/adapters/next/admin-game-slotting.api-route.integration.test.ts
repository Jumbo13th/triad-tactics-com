import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../../../fixtures/dbOperations';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';

const ADMIN_STEAM_ID = '76561198012345678';

async function loadAdminGameSlottingHarness() {
	const { dbOperations } = await import('../../../../fixtures/dbOperations');
	const { PUT } = await import('@/app/api/admin/games/[missionId]/slotting/route');
	const { POST } = await import('@/app/api/admin/games/[missionId]/slotting-import/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, PUT, POST, NextRequest };
}

function missionRouteContext(missionId: number | string) {
	return {
		params: Promise.resolve({ missionId: String(missionId) })
	};
}

function createCanonicalSlotting(opts: { includePriorityUser?: boolean; repeatedPriorityRoles?: boolean }) {
	const slots: Array<Record<string, unknown>> = [
		{
			id: 'slot-squad',
			role: 'Squad Leader',
			access: 'unit',
			occupant: { type: 'placeholder', label: 'Alpha Squad' }
		}
	];

	if (opts.repeatedPriorityRoles) {
		slots.push({
			id: 'slot-mg-1',
			role: 'Machine Gunner',
			access: 'priority',
			occupant: opts.includePriorityUser
				? {
					type: 'user',
					userId: 44,
					callsign: 'Nomad',
					assignedBy: 'self',
					assignedAt: '2026-03-10T10:00:00.000Z'
				}
				: null
		});
		slots.push({
			id: 'slot-mg-2',
			role: 'Machine Gunner',
			access: 'priority',
			occupant: null
		});
	} else {
		slots.push({
			id: 'slot-priority',
			role: 'Machine Gunner',
			access: 'priority',
			occupant: opts.includePriorityUser
				? {
					type: 'user',
					userId: 44,
					callsign: 'Nomad',
					assignedBy: 'self',
					assignedAt: '2026-03-10T10:00:00.000Z'
				}
				: null
		});
	}

	slots.push({
		id: 'slot-regular',
		role: 'Rifleman',
		access: 'regular',
		occupant: null
	});

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

function insertMission(opts: { status?: 'draft' | 'published'; slotting: unknown; regularJoinEnabled?: boolean }): number {
	const db = getDb();
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
		JSON.stringify(opts.slotting),
		ADMIN_STEAM_ID,
		ADMIN_STEAM_ID,
		opts.status === 'published' ? '2026-03-10T10:00:00.000Z' : null,
		opts.status === 'published' ? ADMIN_STEAM_ID : null
	);

	const rowId = result.lastInsertRowid;
	return typeof rowId === 'bigint' ? Number(rowId) : rowId;
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
		const missionId = insertMission({ status: 'draft', slotting: createCanonicalSlotting({ includePriorityUser: false }) });
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
									id: 'slot-priority',
									role: 'Autorifleman',
									access: 'priority',
									occupant: null
								},
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
		expect(json.mission.slottingRevision).toBe(2);
		expect(json.mission.slotting.sides[0].color).toBe('#1D4ED8');
		expect(json.mission.slotting.sides[0].squads[0].slots[1].role).toBe('Autorifleman');
	});

	it('rejects stale slotting revisions', async () => {
		const { dbOperations, PUT, NextRequest } = await loadAdminGameSlottingHarness();
		const missionId = insertMission({ status: 'draft', slotting: createCanonicalSlotting({ includePriorityUser: false }) });
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
					slotting: createCanonicalSlotting({ includePriorityUser: false })
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
			slotting: createCanonicalSlotting({ includePriorityUser: true })
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
									occupant: { type: 'placeholder', label: 'Alpha Squad' }
								},
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
				expect.objectContaining({ reason: 'occupied_slot_removed', slotId: 'slot-priority' })
			])
		);
	});

	it('allows destructive published slotting edits after explicit confirmation', async () => {
		const { dbOperations, PUT, NextRequest } = await loadAdminGameSlottingHarness();
		const missionId = insertMission({
			status: 'published',
			regularJoinEnabled: true,
			slotting: createCanonicalSlotting({ includePriorityUser: true })
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
									occupant: { type: 'placeholder', label: 'Alpha Squad' }
								},
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
		expect(json.mission.slottingRevision).toBe(2);
		expect(json.mission.slotting.sides[0].squads[0].slots).toHaveLength(2);
	});

	it('legacy import preserves slot ids by ordinal and carries matched priority claims', async () => {
		const { dbOperations, POST, NextRequest } = await loadAdminGameSlottingHarness();
		const missionId = insertMission({
			status: 'draft',
			slotting: createCanonicalSlotting({ includePriorityUser: true, repeatedPriorityRoles: true })
		});
		const adminSid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin/games'
		});

		const legacyJson = JSON.stringify({
			sides: [
				{
					name: 'USK',
					squads: [
						{
							name: '1-1',
							slots: [
								{ role: 'Squad Leader', access: 'unit', placeholder: 'Alpha Squad' },
								{ role: 'Machine Gunner', access: 'priority' },
								{ role: 'Machine Gunner', access: 'priority' },
								{ role: 'Rifleman', access: 'regular' }
							]
						}
					]
				}
			]
		});

		const res = await POST(
			new NextRequest(`http://localhost/api/admin/games/${missionId}/slotting-import`, {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ slottingRevision: 1, legacyJson })
			}),
			missionRouteContext(missionId)
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		const slots = json.mission.slotting.sides[0].squads[0].slots;
		expect(slots.map((slot: { id: string }) => slot.id)).toEqual([
			'slot-squad',
			'slot-mg-1',
			'slot-mg-2',
			'slot-regular'
		]);
		expect(slots[1].occupant).toEqual(
			expect.objectContaining({ type: 'user', userId: 44, callsign: 'Nomad' })
		);
		expect(slots[2].occupant).toBeNull();
	});
});
