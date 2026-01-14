import { describe, expect, it, vi } from 'vitest';

vi.mock('@/platform/http', () => {
	const fetchWithLogging = vi.fn(async (input: string | URL) => {
		const url = input.toString();

		if (url.includes('IPlayerService/GetOwnedGames')) {
			return new Response(JSON.stringify({ response: {} }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			});
		}

		return new Response('not found', { status: 404 });
	});

	const redactUrl = (input: string | URL) => input.toString();
	return { fetchWithLogging, redactUrl };
});

describe('verifySteamOwnsGameOrReject', () => {
	it('treats empty GetOwnedGames response as not detected (steam_not_detected)', async () => {
		const { verifySteamOwnsGameOrReject } = await import(
			'@/features/apply/steam/verifyGameOwnership'
		);

		const res = await verifySteamOwnsGameOrReject(
			'fake-key',
			'76561199820474242',
			1874880
		);

		expect(res).toEqual({ ok: false, error: 'steam_not_detected' });
	});
});
