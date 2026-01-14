import { beforeAll, describe, expect, it } from 'vitest';

async function loadSubmitApiRoute() {
	process.env.DISABLE_RATE_LIMITS = 'true';

	const { POST } = await import('@/app/api/submit/route');
	const { NextRequest } = await import('next/server');
	return { POST, NextRequest };
}

function buildApplicationPayload(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		name: 'Test User',
		age: '25',
		email: 'test@example.com',
		city: 'Test City',
		country: 'Test Country',
		availability: 'Weekends and evenings',
		timezone: 'UTC+02:00',
		experience: 'I have experience with milsim communities and moderation.',
		motivation: 'I want to help the community and contribute in a positive way.',
		...overrides
	};
}

beforeAll(() => {
	delete process.env.STEAM_WEB_API_KEY;
});

describe('Apply workflow: submit route (integration: validation + auth gating)', () => {
	it('returns validation_error for invalid payload', async () => {
		const { POST, NextRequest } = await loadSubmitApiRoute();

		const req = new NextRequest('http://localhost/api/submit', {
			method: 'POST',
			headers: {
				'content-type': 'application/json'
			},
			body: JSON.stringify({ email: 'not-an-email' })
		});

		const res = await POST(req);
		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json.error).toBe('validation_error');
	});

	it('returns steam_not_connected when valid payload but no Steam session', async () => {
		const { POST, NextRequest } = await loadSubmitApiRoute();

		const req = new NextRequest('http://localhost/api/submit', {
			method: 'POST',
			headers: {
				'content-type': 'application/json'
			},
			body: JSON.stringify(buildApplicationPayload())
		});

		const res = await POST(req);
		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json.error).toBe('steam_not_connected');
	});

	it('accepts missing city/country (validation passes) and still gates on Steam session', async () => {
		const { POST, NextRequest } = await loadSubmitApiRoute();

		const body: Record<string, unknown> = buildApplicationPayload({
			city: undefined,
			country: undefined
		});
		delete body.city;
		delete body.country;

		const req = new NextRequest('http://localhost/api/submit', {
			method: 'POST',
			headers: {
				'content-type': 'application/json'
			},
			body: JSON.stringify(body)
		});

		const res = await POST(req);
		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json.error).toBe('steam_not_connected');
	});
});
