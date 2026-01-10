const DEFAULT_TIMEOUT_MS = 5000;

export type SteamVerificationResult =
  | { ok: true }
  | { ok: false; error: 'steam_private' | 'steam_no_game' | 'steam_api_unavailable' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

async function isSteamProfilePublic(
  steamApiKey: string,
  steamid64: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<boolean | null> {
  const url = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/');
  url.searchParams.set('key', steamApiKey);
  url.searchParams.set('steamids', steamid64);

  const json = await fetchJson(url.toString(), timeoutMs);

  if (!isRecord(json)) return null;
  const response = json.response;
  if (!isRecord(response)) return null;
  const players = response.players;
  if (!Array.isArray(players)) return null;
  const player = players[0];
  if (!isRecord(player)) return null;

  // 3 = public
  const visibility = player.communityvisibilitystate;
  if (typeof visibility === 'number') {
    return visibility === 3;
  }
  return null;
}

async function checkOwnedGameForPublicProfile(
  steamApiKey: string,
  steamid64: string,
  appId: number,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<'owned' | 'not_owned' | 'unknown'> {
  const url = new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/');
  url.searchParams.set('key', steamApiKey);
  url.searchParams.set('steamid', steamid64);
  url.searchParams.set('include_appinfo', '0');
  url.searchParams.set('include_played_free_games', '1');
  url.searchParams.set('appids_filter[0]', String(appId));

  const json = await fetchJson(url.toString(), timeoutMs);
  if (!isRecord(json)) return 'unknown';
  const response = json.response;
  if (!isRecord(response)) return 'unknown';
  const gameCount = response.game_count;
  if (typeof gameCount === 'number') {
    return gameCount > 0 ? 'owned' : 'not_owned';
  }
  return 'unknown';
}

export async function verifySteamOwnsGameOrReject(
  steamApiKey: string,
  steamid64: string,
  appId: number
): Promise<SteamVerificationResult> {
  const isPublic = await isSteamProfilePublic(steamApiKey, steamid64);

  if (isPublic === false) {
    return { ok: false, error: 'steam_private' };
  }

  // Fail closed if we can't determine visibility.
  if (isPublic !== true) {
    return { ok: false, error: 'steam_api_unavailable' };
  }

  const owned = await checkOwnedGameForPublicProfile(steamApiKey, steamid64, appId);
  if (owned === 'owned') {
    return { ok: true };
  }

  if (owned === 'not_owned') {
    return { ok: false, error: 'steam_no_game' };
  }

  // Fail closed if we can't verify ownership.
  return { ok: false, error: 'steam_api_unavailable' };
}
