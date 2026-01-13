import { fetchWithLogging } from '@/platform/http';

export async function verifySteamOpenIdAssertion(params: URLSearchParams): Promise<boolean> {
	// Per OpenID 2.0: POST back to the OP with mode=check_authentication.
	const verifyParams = new URLSearchParams(params);
	verifyParams.set('openid.mode', 'check_authentication');

	const res = await fetchWithLogging('https://steamcommunity.com/openid/login', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: verifyParams.toString(),
		signal: AbortSignal.timeout(7000)
	}, { name: 'steam.openid.verify' });

	if (!res.ok) return false;
	const text = await res.text();
	return /is_valid\s*:\s*true/i.test(text);
}
