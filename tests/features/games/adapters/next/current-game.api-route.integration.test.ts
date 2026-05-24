import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { getDb } from '../../../../fixtures/dbOperations';

async function loadCurrentGameHarness() {
	const { GET } = await import('@/app/api/games/current/route');
	const { NextRequest } = await import('next/server');
	return { GET, NextRequest };
}

describe('Current game endpoint (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({ prefix: 'triad-tactics-current-game-test' });
	});

	beforeEach(async () => {
		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		dbOperations.clearAll();
	});

	it('returns null when no mission is published', async () => {
		const { GET, NextRequest } = await loadCurrentGameHarness();
		const res = await GET(new NextRequest('http://localhost/api/games/current'));

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.current).toBeNull();
	});

	it('returns the published mission summary', async () => {
		const { GET, NextRequest } = await loadCurrentGameHarness();
		const db = getDb();
		db.prepare(`
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
		`).run(
			'OP-42',
			'Operation Forty Two',
			JSON.stringify({ en: 'Hold the road junction.', ru: '', uk: '', ar: '' }),
			'2026-03-15T18:00:00.000Z',
			'Triad Server',
			'203.0.113.15',
			2001,
			JSON.stringify({ sides: [] })
		);

		const res = await GET(new NextRequest('http://localhost/api/games/current'));

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.current).toEqual({
			shortCode: 'OP-42',
			gameMode: 'standard',
			title: 'Operation Forty Two',
			description: { en: 'Hold the road junction.', ru: '', uk: '', ar: '' },
			startsAt: '2026-03-15T18:00:00.000Z'
		});
	});
});
