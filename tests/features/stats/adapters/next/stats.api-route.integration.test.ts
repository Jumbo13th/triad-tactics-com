import { beforeAll, describe, expect, it } from 'vitest';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';

const ADMIN_STEAM_ID = '76561198012345678';
const GAMESERVER_SECRET = 'test-gameserver-secret';

async function loadHarness() {
	const { dbOperations, getDb } = await import('../../../../fixtures/dbOperations');
	const { GET: GET_STATS, POST: POST_STATS } = await import('@/app/api/admin/stats/route');
	const { GET: GET_SEASON } = await import('@/app/api/gameserver/season/route');
	const { GET: GET_UNITS } = await import('@/app/api/gameserver/units/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, getDb, GET_STATS, POST_STATS, GET_SEASON, GET_UNITS, NextRequest };
}

type Seeded = { missionId: number; unitAlfaId: number; unitBravoId: number };

async function seed(): Promise<Seeded> {
	const { getDb } = await import('../../../../fixtures/dbOperations');
	const db = getDb();

	const userA1 = Number(db.prepare(`INSERT INTO users (current_callsign, arma_guid) VALUES ('AlphaOne', 'GUID-A1')`).run().lastInsertRowid);
	const userA2 = Number(db.prepare(`INSERT INTO users (current_callsign, arma_guid) VALUES ('AlphaTwo', 'GUID-A2')`).run().lastInsertRowid);
	const userB1 = Number(db.prepare(`INSERT INTO users (current_callsign, arma_guid) VALUES ('BravoOne', 'GUID-B1')`).run().lastInsertRowid);

	const unitAlfaId = Number(
		db.prepare(`INSERT INTO units (name, tag, status, created_by_user_id) VALUES ('Alfa Unit', 'ALFA', 'verified', ?)`).run(userA1).lastInsertRowid
	);
	const unitBravoId = Number(
		db.prepare(`INSERT INTO units (name, tag, status, created_by_user_id) VALUES ('Bravo Unit', 'BRVO', 'verified', ?)`).run(userB1).lastInsertRowid
	);

	db.prepare(`INSERT INTO unit_memberships (unit_id, user_id, role) VALUES (?, ?, 'leader')`).run(unitAlfaId, userA1);
	db.prepare(`INSERT INTO unit_memberships (unit_id, user_id, role) VALUES (?, ?, 'member')`).run(unitAlfaId, userA2);
	db.prepare(`INSERT INTO unit_memberships (unit_id, user_id, role) VALUES (?, ?, 'leader')`).run(unitBravoId, userB1);

	// Occupancy denominator: ALFA members claimed 4 slots in the slotting.
	const slotting = {
		sides: [
			{
				id: 'side-1-us',
				name: 'US',
				color: '#3b82f6',
				squads: [
					{
						id: 's1',
						name: 'Aktiv-11',
						slots: [
							{ id: 'sl1', role: 'SL', access: 'unit', occupant: { type: 'user', userId: userA1, callsign: 'AlphaOne', assignedBy: 'self', assignedAt: 'x' } },
							{ id: 'sl2', role: 'R1', access: 'unit', occupant: { type: 'user', userId: userA2, callsign: 'AlphaTwo', assignedBy: 'self', assignedAt: 'x' } },
							{ id: 'sl3', role: 'R2', access: 'unit', occupant: { type: 'user', userId: userA1, callsign: 'AlphaOne', assignedBy: 'self', assignedAt: 'x' } },
							{ id: 'sl4', role: 'R3', access: 'unit', occupant: { type: 'user', userId: userA2, callsign: 'AlphaTwo', assignedBy: 'self', assignedAt: 'x' } },
						],
					},
				],
			},
		],
	};

	const missionId = Number(
		db
			.prepare(`INSERT INTO missions (status, title, slotting_json) VALUES ('published', 'Test Operation', ?)`)
			.run(JSON.stringify(slotting)).lastInsertRowid
	);

	return { missionId, unitAlfaId, unitBravoId };
}

function buildSnapshotText(): string {
	return JSON.stringify({
		schema: 'll-stats/1',
		sessionId: '20260716-190000-TestWorld',
		phase: 'approved',
		missionName: 'Test Operation',
		startedAt: '2026-07-16 19:00:00',
		winner: 'US',
		config: {},
		factions: ['US', 'USSR'],
		commanders: [{ faction: 'US', unitTag: 'ALFA' }],
		players: [
			{ guid: 'GUID-A1', name: '[ALFA]AlphaOne', unitTag: 'ALFA', faction: 'US', participated: true },
			{ guid: 'GUID-A2', name: '[ALFA]AlphaTwo', unitTag: 'ALFA', faction: 'US', participated: true },
			{ guid: 'GUID-B1', name: '[BRVO]BravoOne', unitTag: 'BRVO', faction: 'USSR', participated: true },
			{ guid: 'GUID-UNKNOWN', name: 'Stray', unitTag: '', faction: 'USSR', participated: true },
		],
		events: [
			{ t: 100, type: 'kill', actor: 'GUID-A1', victim: 'GUID-B1', points: 1 },
			{ t: 200, type: 'zonekill', actor: 'GUID-A2', victim: 'GUID-B1', source: 'Bridge', points: 2 },
			{ t: 300, type: 'kill', actor: 'GUID-B1', victim: 'GUID-A1', points: 1 },
			{ t: 400, type: 'teamkill', actor: 'GUID-B1', victim: 'GUID-UNKNOWN', points: -2 },
			{ t: 500, type: 'survivor', actor: 'GUID-A2', points: 1 },
			{ t: 450, type: 'capture', source: 'zone_bridge', detail: 'Bridge', points: 20 },
		],
		zones: [
			{
				name: 'Bridge',
				entityName: 'zone_bridge',
				pool: 20,
				maxPerPlayer: 0,
				attackerFaction: 'US',
				defenderFaction: 'USSR',
				captured: true,
				presence: [
					{ guid: 'GUID-A1', seconds: 300 },
					{ guid: 'GUID-B1', seconds: 500 },
				],
			},
		],
	});
}

function adminHeaders(sid: string) {
	// origin satisfies the same-origin CSRF gate on admin mutations.
	return { cookie: `tt_steam_session=${sid}`, 'content-type': 'application/json', origin: 'http://localhost' };
}

describe('Stats API (handler e2e)', () => {
	let seeded: Seeded;
	let sid: string;

	beforeAll(async () => {
		process.env.GAMESERVER_API_SECRET = GAMESERVER_SECRET;
		await setupIsolatedDb({ prefix: 'triad-tactics-stats-test', adminSteamIds: ADMIN_STEAM_ID });

		seeded = await seed();

		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		sid = createSteamSession(dbOperations, {
			steamid64: ADMIN_STEAM_ID,
			redirectPath: '/en/admin',
			personaName: 'Admin',
		});
	});

	it('rejects the season endpoint without the shared secret', async () => {
		const { GET_SEASON, NextRequest } = await loadHarness();
		const res = await GET_SEASON(new NextRequest('http://localhost/api/gameserver/season', { method: 'GET' }));
		expect(res.status).toBe(401);
	});

	it('serves the units roster to the game server', async () => {
		const { GET_UNITS, NextRequest } = await loadHarness();
		const res = await GET_UNITS(
			new NextRequest(`http://localhost/api/gameserver/units?secret=${GAMESERVER_SECRET}`, { method: 'GET' })
		);
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.units.map((u: { tag: string }) => u.tag)).toEqual(['ALFA', 'BRVO']);
	});

	it('runs the full upload → automap → publish → standings flow', async () => {
		const { POST_STATS, GET_SEASON, NextRequest } = await loadHarness();

		// Season first.
		const seasonRes = await POST_STATS(
			new NextRequest('http://localhost/api/admin/stats', {
				method: 'POST',
				headers: adminHeaders(sid),
				body: JSON.stringify({ action: 'createSeason', name: 'Season 1' }),
			})
		);
		expect(seasonRes.status).toBe(200);

		// Upload.
		const uploadRes = await POST_STATS(
			new NextRequest('http://localhost/api/admin/stats', {
				method: 'POST',
				headers: adminHeaders(sid),
				body: JSON.stringify({
					action: 'upload',
					missionId: seeded.missionId,
					episodeNumber: 1,
					snapshotText: buildSnapshotText(),
				}),
			})
		);
		expect(uploadRes.status).toBe(200);
		const upload = await uploadRes.json();
		const gameStatsId = upload.gameStatsId as number;

		// Automap resolved registered players to their units; the stray stays null.
		const players = upload.view.players as { guid: string; resolvedUnitId: number | null }[];
		const byGuid = new Map(players.map((p) => [p.guid, p.resolvedUnitId]));
		expect(byGuid.get('GUID-A1')).toBe(seeded.unitAlfaId);
		expect(byGuid.get('GUID-B1')).toBe(seeded.unitBravoId);
		expect(byGuid.get('GUID-UNKNOWN')).toBeNull();

		// The GM's in-game commander pick arrived as a tag and resolved to the unit.
		expect(upload.view.mapping.commanders).toEqual([{ faction: 'US', unitId: seeded.unitAlfaId }]);

		// Preview: ALFA won with the commander multiplier; occupancy 2/4 = 50%.
		const preview = upload.view.preview as { unitId: number; multiplier: number; occupancyPct: number | null; objectivePoints: number }[];
		const alfaPreview = preview.find((r) => r.unitId === seeded.unitAlfaId);
		expect(alfaPreview?.multiplier).toBeCloseTo(1.5);
		expect(alfaPreview?.occupancyPct).toBe(50);
		// Captured zone: only US presence (A1) shares the 20-point pool.
		expect(alfaPreview?.objectivePoints).toBeCloseTo(20);

		// Publish.
		const publishRes = await POST_STATS(
			new NextRequest('http://localhost/api/admin/stats', {
				method: 'POST',
				headers: adminHeaders(sid),
				body: JSON.stringify({ action: 'publish', gameStatsId }),
			})
		);
		expect(publishRes.status).toBe(200);
		const published = await publishRes.json();
		expect(published.rowCount).toBeGreaterThanOrEqual(2);

		// Re-uploading the same episode is refused once published.
		const dupRes = await POST_STATS(
			new NextRequest('http://localhost/api/admin/stats', {
				method: 'POST',
				headers: adminHeaders(sid),
				body: JSON.stringify({
					action: 'upload',
					missionId: seeded.missionId,
					episodeNumber: 1,
					snapshotText: buildSnapshotText(),
				}),
			})
		);
		expect(dupRes.status).toBe(400);
		const dup = await dupRes.json();
		expect(dup.error).toBe('episode_already_published');

		// The game server's season standings now rank ALFA first.
		const seasonFetch = await GET_SEASON(
			new NextRequest(`http://localhost/api/gameserver/season?secret=${GAMESERVER_SECRET}`, { method: 'GET' })
		);
		expect(seasonFetch.status).toBe(200);
		const season = await seasonFetch.json();
		expect(season.season.name).toBe('Season 1');
		expect(season.standings[0].tag).toBe('ALFA');
		expect(season.standings[0].wins).toBe(1);
		expect(season.standings[0].commandWins).toBe(1);
		expect(season.standings[0].score).toBeGreaterThan(0);
	});

	it('rejects stats mutations from non-admins', async () => {
		const { POST_STATS, NextRequest } = await loadHarness();
		const res = await POST_STATS(
			new NextRequest('http://localhost/api/admin/stats', {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin: 'http://localhost' },
				body: JSON.stringify({ action: 'setStatsHidden', hidden: true }),
			})
		);
		expect(res.status).toBe(401);
	});

	it('round-trips the hide-statistics toggle', async () => {
		const { GET_STATS, POST_STATS, NextRequest } = await loadHarness();

		const onRes = await POST_STATS(
			new NextRequest('http://localhost/api/admin/stats', {
				method: 'POST',
				headers: adminHeaders(sid),
				body: JSON.stringify({ action: 'setStatsHidden', hidden: true }),
			})
		);
		expect(onRes.status).toBe(200);

		const hiddenRes = await GET_STATS(new NextRequest('http://localhost/api/admin/stats', { method: 'GET', headers: adminHeaders(sid) }));
		expect((await hiddenRes.json()).statsHidden).toBe(true);

		const offRes = await POST_STATS(
			new NextRequest('http://localhost/api/admin/stats', {
				method: 'POST',
				headers: adminHeaders(sid),
				body: JSON.stringify({ action: 'setStatsHidden', hidden: false }),
			})
		);
		expect(offRes.status).toBe(200);

		const visibleRes = await GET_STATS(new NextRequest('http://localhost/api/admin/stats', { method: 'GET', headers: adminHeaders(sid) }));
		expect((await visibleRes.json()).statsHidden).toBe(false);
	});

});
