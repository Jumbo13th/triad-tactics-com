import { beforeAll, describe, expect, it } from 'vitest';
import { setupIsolatedDb } from '../../../fixtures/isolatedDb';

// Season rollover: the showcase (main-page teaser) must keep serving the
// previous season's standings while the freshly started season has no
// published games yet — otherwise the teaser (and its /stats link) vanishes.
describe('getShowcaseStandings (integration)', () => {
	let closedSeasonId: number;
	let activeSeasonId: number;
	let missionId: number;
	let unitId: number;

	beforeAll(async () => {
		await setupIsolatedDb({ prefix: 'stats-showcase' });

		const { getDb } = await import('../../../fixtures/dbOperations');
		const db = getDb();

		const userId = Number(
			db.prepare(`INSERT INTO users (current_callsign, arma_guid) VALUES ('AlphaOne', 'GUID-A1')`).run().lastInsertRowid
		);
		unitId = Number(
			db.prepare(`INSERT INTO units (name, tag, status, created_by_user_id) VALUES ('Alfa Unit', 'ALFA', 'verified', ?)`).run(userId).lastInsertRowid
		);
		missionId = Number(
			db.prepare(`INSERT INTO missions (status, title, slotting_json) VALUES ('published', 'Test Operation', '{}')`).run().lastInsertRowid
		);

		closedSeasonId = Number(
			db.prepare(`INSERT INTO seasons (name, status, ends_at) VALUES ('Season 1', 'closed', datetime('now'))`).run().lastInsertRowid
		);
		const gameId = Number(
			db
				.prepare(
					`INSERT INTO game_stats (mission_id, episode_number, season_id, status, snapshot_json, snapshot_hash, mission_name, played_at, published_at)
					 VALUES (?, 1, ?, 'published', '{}', 'hash-showcase-1', 'Test Operation', '2026-08-01 19:00:00', datetime('now'))`
				)
				.run(missionId, closedSeasonId).lastInsertRowid
		);
		db.prepare(
			`INSERT INTO game_stats_unit_scores (game_stats_id, unit_id, side, participants, final_points, is_winner_side)
			 VALUES (?, ?, 'US', 4, 12.5, 1)`
		).run(gameId, unitId);

		activeSeasonId = Number(db.prepare(`INSERT INTO seasons (name, status) VALUES ('Season 2', 'active')`).run().lastInsertRowid);
	});

	it('falls back to the newest season with games while the active season is empty', async () => {
		const { statsDeps } = await import('@/features/stats/deps');
		const { getSeasonStandings } = await import('@/features/stats/useCases/getSeasonStandings');
		const { getShowcaseStandings } = await import('@/features/stats/useCases/getShowcaseStandings');

		// Plain default resolves to the empty active season…
		const plain = getSeasonStandings(statsDeps);
		expect(plain.season?.id).toBe(activeSeasonId);
		expect(plain.rows).toHaveLength(0);

		// …the showcase falls back to the closed season that has data.
		const showcase = getShowcaseStandings(statsDeps);
		expect(showcase.season?.id).toBe(closedSeasonId);
		expect(showcase.season?.name).toBe('Season 1');
		expect(showcase.rows).toHaveLength(1);
		expect(showcase.rows[0]?.unitTag).toBe('ALFA');
	});

	it('returns the active season as soon as it has published games', async () => {
		const { getDb } = await import('../../../fixtures/dbOperations');
		const db = getDb();
		const gameId = Number(
			db
				.prepare(
					`INSERT INTO game_stats (mission_id, episode_number, season_id, status, snapshot_json, snapshot_hash, mission_name, played_at, published_at)
					 VALUES (?, 2, ?, 'published', '{}', 'hash-showcase-2', 'Test Operation', '2026-08-15 19:00:00', datetime('now'))`
				)
				.run(missionId, activeSeasonId).lastInsertRowid
		);
		db.prepare(
			`INSERT INTO game_stats_unit_scores (game_stats_id, unit_id, side, participants, final_points, is_winner_side)
			 VALUES (?, ?, 'US', 3, 7, 0)`
		).run(gameId, unitId);

		const { statsDeps } = await import('@/features/stats/deps');
		const { getShowcaseStandings } = await import('@/features/stats/useCases/getShowcaseStandings');

		const showcase = getShowcaseStandings(statsDeps);
		expect(showcase.season?.id).toBe(activeSeasonId);
		expect(showcase.season?.name).toBe('Season 2');
		expect(showcase.rows).toHaveLength(1);
	});
});
