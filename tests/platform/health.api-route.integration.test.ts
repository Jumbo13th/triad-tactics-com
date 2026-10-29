import { beforeAll, describe, expect, it } from 'vitest';
import { setupIsolatedDb } from '../fixtures/isolatedDb';

describe('Health endpoint (integration)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({ prefix: 'triad-tactics-health-test' });
	});

	it('answers from the database without caching', async () => {
		const { GET } = await import('@/app/api/health/route');
		const res = GET();

		expect(res.status).toBe(200);
		expect(await res.text()).toBe('ok');
		expect(res.headers.get('cache-control')).toBe('no-store');
	});
});
