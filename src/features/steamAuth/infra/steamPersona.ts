export async function fetchSteamPersonaName(steamApiKey: string, steamid64: string): Promise<string | null> {
	try {
		const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

		const url = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/');
		url.searchParams.set('key', steamApiKey);
		url.searchParams.set('steamids', steamid64);

		const res = await fetch(url.toString(), {
			signal: AbortSignal.timeout(5000)
		});

		if (!res.ok) return null;
		const json: unknown = (await res.json()) as unknown;
		if (!isRecord(json)) return null;
		const response = json.response;
		if (!isRecord(response)) return null;
		const players = response.players;
		if (!Array.isArray(players)) return null;
		const player = players[0];
		if (!isRecord(player)) return null;
		const name = typeof player.personaname === 'string' ? player.personaname : null;
		return name;
	} catch {
		return null;
	}
}
