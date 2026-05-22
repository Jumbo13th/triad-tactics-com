import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApplicationRecord } from '../../../../fixtures/application';
import { getDb } from '../../../../fixtures/dbOperations';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';

const ADMIN_STEAM_ID = '76561198012345678';

async function loadGameArchiveHarness() {
	const { dbOperations } = await import('../../../../fixtures/dbOperations');
	const { GET } = await import('@/app/api/games/archive/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, GET, NextRequest };
}

function createConfirmedPlayer(
	dbOperations: Awaited<ReturnType<typeof loadGameArchiveHarness>>['dbOperations'],
	input: { steamId64: string; callsign: string }
) {
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

	const applicationId = Number(inserted.id);
	const confirmed = dbOperations.confirmApplication(applicationId, ADMIN_STEAM_ID);
	expect(confirmed.success).toBe(true);

	const user = dbOperations.getUserBySteamId64(input.steamId64);
	if (!user?.id) throw new Error('Expected confirmed user to exist');
	dbOperations.setArmaGuidByUserId({ userId: user.id, armaGuid: `test-guid-${input.steamId64}` });

	return createSteamSession(dbOperations, {
		steamid64: input.steamId64,
		redirectPath: '/en/games'
	});
}

function insertArchivedMission(opts: {
	shortCode: string;
	title: string;
	archivedAt: string;
	archiveStatus: 'completed' | 'canceled';
	archiveReason?: string | null;
	archiveResult?: unknown;
}) {
	getDb()
		.prepare(`
			INSERT INTO missions (
				short_code,
				status,
				title,
				description,
				starts_at,
				server_name,
				server_host,
				server_port,
				archive_status,
				archive_reason,
				archive_result_json,
				published_at,
				archived_at,
				created_by_steamid64,
				updated_by_steamid64,
				published_by_steamid64,
				archived_by_steamid64,
				slotting_json
			)
			VALUES (?, 'archived', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`)
		.run(
			opts.shortCode,
			opts.title,
			JSON.stringify({ en: `${opts.title} summary.`, ru: '', uk: '', ar: '' }),
			'2026-03-20T19:00:00.000Z',
			'Triad Server',
			'203.0.113.50',
			2302,
			opts.archiveStatus,
			opts.archiveReason ?? null,
			opts.archiveResult ? JSON.stringify(opts.archiveResult) : null,
			'2026-03-20 18:00:00',
			opts.archivedAt,
			ADMIN_STEAM_ID,
			ADMIN_STEAM_ID,
			ADMIN_STEAM_ID,
			ADMIN_STEAM_ID,
			JSON.stringify({ sides: [] })
		);
}

describe('Game archive endpoint (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({
			prefix: 'triad-tactics-game-archive-test',
			adminSteamIds: ADMIN_STEAM_ID
		});
	});

	beforeEach(async () => {
		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		dbOperations.clearAll();
	});

	it('returns an empty archive list when no missions are archived', async () => {
		const { dbOperations, GET, NextRequest } = await loadGameArchiveHarness();
		const sessionId = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000400',
			callsign: 'ArchiveViewer'
		});

		const res = await GET(
			new NextRequest('http://localhost/api/games/archive', {
				headers: { cookie: `tt_steam_session=${sessionId}` }
			})
		);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true, archive: [] });
	});

	it('returns archived mission summaries newest first with final results only', async () => {
		const { dbOperations, GET, NextRequest } = await loadGameArchiveHarness();
		const sessionId = createConfirmedPlayer(dbOperations, {
			steamId64: '76561198000000401',
			callsign: 'ArchiveReader'
		});

		insertArchivedMission({
			shortCode: 'OP-ARCHIVE-OLDER',
			title: 'Operation Older',
			archivedAt: '2026-03-21 18:00:00',
			archiveStatus: 'completed',
			archiveResult: {
				outcome: 'winner',
				winnerSideId: 'usk',
				sideScores: [
					{ sideId: 'usk', sideName: 'usk', score: 12 },
					{ sideId: 'rus', sideName: 'rus', score: 8 }
				]
			}
		});
		insertArchivedMission({
			shortCode: 'OP-ARCHIVE-NEWER',
			title: 'Operation Newer',
			archivedAt: '2026-03-22 18:00:00',
			archiveStatus: 'canceled',
			archiveReason: 'Server outage'
		});
		getDb()
			.prepare(`
				INSERT INTO missions (
					short_code,
					status,
					title,
					description,
					starts_at,
					server_name,
					server_host,
					server_port,
					slotting_json
				)
				VALUES (?, 'published', ?, ?, ?, ?, ?, ?, ?)
			`)
			.run(
				'OP-LIVE',
				'Operation Live',
				JSON.stringify({ en: 'Current mission.', ru: '', uk: '', ar: '' }),
				'2026-03-23T19:00:00.000Z',
				'Triad Server',
				'203.0.113.60',
				2302,
				JSON.stringify({ sides: [] })
			);

		const res = await GET(
			new NextRequest('http://localhost/api/games/archive', {
				headers: { cookie: `tt_steam_session=${sessionId}` }
			})
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.archive).toEqual([
			{
				shortCode: 'OP-ARCHIVE-NEWER',
				title: 'Operation Newer',
				description: { en: 'Operation Newer summary.', ru: '', uk: '', ar: '' },
				startsAt: '2026-03-20T19:00:00.000Z',
				archivedAt: '2026-03-22 18:00:00',
				archiveStatus: 'canceled',
				archiveReason: 'Server outage',
				archiveResult: null
			},
			{
				shortCode: 'OP-ARCHIVE-OLDER',
				title: 'Operation Older',
				description: { en: 'Operation Older summary.', ru: '', uk: '', ar: '' },
				startsAt: '2026-03-20T19:00:00.000Z',
				archivedAt: '2026-03-21 18:00:00',
				archiveStatus: 'completed',
				archiveReason: null,
				archiveResult: {
					outcome: 'winner',
					winnerSideId: 'usk',
					sideScores: [
						{ sideId: 'usk', sideName: 'usk', score: 12 },
						{ sideId: 'rus', sideName: 'rus', score: 8 }
					]
				}
			}
		]);
	});
});
