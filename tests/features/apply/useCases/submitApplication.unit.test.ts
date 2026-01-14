import { describe, expect, it } from 'vitest';
import { submitApplication } from '@/features/apply/useCases/submitApplication';
import type { SubmitApplicationDeps } from '@/features/apply/ports';

function makeDeps(overrides?: {
	repo?: Partial<SubmitApplicationDeps['repo']>;
	steam?: Partial<SubmitApplicationDeps['steam']>;
}): SubmitApplicationDeps {
	const deps: SubmitApplicationDeps = {
		repo: {
			insertApplication: () => ({ success: true, id: 1 }),
			getBySteamId64: () => null
		},
		steam: {
			verifySteamOwnsGameOrReject: async () => ({ ok: true })
		}
	};
	return {
		...deps,
		...overrides,
		repo: { ...deps.repo, ...(overrides?.repo ?? {}) },
		steam: { ...deps.steam, ...(overrides?.steam ?? {}) }
	};
}

function buildValidBody() {
	return {
		name: 'Test User',
		age: '25',
		email: 'test@example.com',
		city: 'Test City',
		country: 'Test Country',
		availability: 'Weekends and evenings',
		timezone: 'UTC+02:00',
		experience: 'I have experience with milsim communities and moderation.',
		motivation: 'I want to help the community and contribute in a positive way.'
	};
}

describe('submitApplication (use case)', () => {
	it('rejects when Steam is not connected', async () => {
		const res = await submitApplication(makeDeps(), {
			body: buildValidBody(),
			steam: { steamid64: null, personaName: null },
			ipAddress: '203.0.113.10',
			steamWebApiKey: 'fake',
			bypassRateLimit: true,
			rateLimitDecision: { allowed: true, retryAfterSeconds: 0 },
			markRateLimited: () => {}
		});
		expect(res.status).toBe(400);
		expect(res.json).toEqual({ error: 'steam_not_connected' });
	});

	it('normalizes unsupported localeHint to en', async () => {
		let capturedLocale: string | undefined;
		const deps = makeDeps({
			repo: {
				insertApplication: (application) => {
					capturedLocale = application.locale;
					return { success: true, id: 1 };
				}
			}
		});

		const res = await submitApplication(deps, {
			body: buildValidBody(),
			steam: { steamid64: '76561198000000000', personaName: 'Persona' },
			ipAddress: '203.0.113.10',
			localeHint: 'de',
			steamWebApiKey: 'fake',
			bypassRateLimit: true,
			rateLimitDecision: { allowed: true, retryAfterSeconds: 0 },
			markRateLimited: () => {}
		});

		expect(res.status).toBe(201);
		expect(capturedLocale).toBe('en');
	});

	it('returns duplicate when repo reports duplicate', async () => {
		const deps = makeDeps({
			repo: {
				insertApplication: () => ({ success: false, error: 'duplicate' }),
				getBySteamId64: () => ({
					id: 1,
					email: 'test@example.com',
					steamid64: '76561198000000000',
					persona_name: 'Persona',
					answers: {
						name: 'Test User',
						age: '25',
						email: 'test@example.com',
						city: 'Test City',
						country: 'Test Country',
						availability: 'Weekends and evenings',
						timezone: 'UTC+02:00',
						experience: 'I have experience with milsim communities and moderation.',
						motivation: 'I want to help the community and contribute in a positive way.',
						verified_game_access: true
					},
					ip_address: '203.0.113.10',
					locale: 'en',
					created_at: new Date().toISOString()
				})
			}
		});

		const res = await submitApplication(deps, {
			body: buildValidBody(),
			steam: { steamid64: '76561198000000000', personaName: 'Persona' },
			ipAddress: '203.0.113.10',
			steamWebApiKey: 'fake',
			bypassRateLimit: true,
			rateLimitDecision: { allowed: true, retryAfterSeconds: 0 },
			markRateLimited: () => {}
		});

		expect(res.status).toBe(409);
		if (res.ok || res.status !== 409) throw new Error('Expected duplicate result');
		expect(res.json.error).toBe('duplicate');
	});
});
