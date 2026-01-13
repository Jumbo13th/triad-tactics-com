import { errorToLogObject, logger } from '@/platform/logger';
import { fetchWithLogging, redactUrl } from '@/platform/http';

const DEFAULT_TIMEOUT_MS = 5000;

export type SteamVerificationResult =
  | { ok: true }
  | { ok: false; error: 'steam_private' | 'steam_no_game' | 'steam_api_unavailable' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function maskSteamId64(value: string): string {
  // Avoid logging full identifiers; keep enough to correlate user reports.
  if (value.length <= 6) return '***';
  return `${value.slice(0, 3)}…${value.slice(-3)}`;
}

function jsonShape(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

async function safeReadBodySnippet(res: Response, limit = 1024): Promise<string | undefined> {
  try {
    const text = await res.clone().text();
    if (!text) return undefined;
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
  } catch {
    return undefined;
  }
}

async function fetchJson(
  url: string,
  timeoutMs: number,
  meta: { endpoint: string; steamid64?: string; appId?: number }
): Promise<{ status: number; json: unknown } | null> {
  try {
    const res = await fetchWithLogging(url, {
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) {
      const bodySnippet = await safeReadBodySnippet(res);
      logger.warn(
        {
      endpoint: meta.endpoint,
      steamid64: meta.steamid64 ? maskSteamId64(meta.steamid64) : undefined,
      appId: meta.appId,
      url: redactUrl(url),
      status: res.status,
      bodySnippet
    },
        'steam_api_non_ok_response'
      );
      return null;
    }

    const resForJson = res.clone();
    let json: unknown;
    try {
      json = (await resForJson.json()) as unknown;
    } catch (error: unknown) {
      const bodySnippet = await safeReadBodySnippet(res);
      logger.warn(
        {
          ...errorToLogObject(error),
          endpoint: meta.endpoint,
          steamid64: meta.steamid64 ? maskSteamId64(meta.steamid64) : undefined,
          appId: meta.appId,
          url: redactUrl(url),
          status: res.status,
          bodySnippet
        },
        'steam_api_json_parse_failed'
      );
      return null;
    }

    return { status: res.status, json };
  } catch (error: unknown) {
    logger.warn(
    {
      ...errorToLogObject(error),
      endpoint: meta.endpoint,
      steamid64: meta.steamid64 ? maskSteamId64(meta.steamid64) : undefined,
      appId: meta.appId,
      url: redactUrl(url)
    },
    'steam_api_fetch_failed'
  );
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

  const result = await fetchJson(url.toString(), timeoutMs, {
	endpoint: 'ISteamUser.GetPlayerSummaries',
	steamid64
  });
  if (!result) return null;
  const json = result.json;

  if (!isRecord(json)) {
	logger.warn(
		{ endpoint: 'ISteamUser.GetPlayerSummaries', status: result.status, rootShape: jsonShape(json), steamid64: maskSteamId64(steamid64) },
		'steam_api_unexpected_response_shape'
	);
	return null;
  }
  const response = json.response;
  if (!isRecord(response)) {
	logger.warn(
		{ endpoint: 'ISteamUser.GetPlayerSummaries', status: result.status, responseShape: jsonShape(response), steamid64: maskSteamId64(steamid64) },
		'steam_api_unexpected_response_shape'
	);
	return null;
  }
  const players = response.players;
  if (!Array.isArray(players)) {
	logger.warn(
		{ endpoint: 'ISteamUser.GetPlayerSummaries', status: result.status, playersShape: jsonShape(players), steamid64: maskSteamId64(steamid64) },
		'steam_api_unexpected_response_shape'
	);
	return null;
  }
  const player = players[0];
  if (!isRecord(player)) {
	logger.warn(
		{ endpoint: 'ISteamUser.GetPlayerSummaries', status: result.status, playersLength: players.length, playerShape: jsonShape(player), steamid64: maskSteamId64(steamid64) },
		'steam_api_unexpected_response_shape'
	);
	return null;
  }

  // 3 = public
  const visibility = player.communityvisibilitystate;
  if (typeof visibility === 'number') {
    return visibility === 3;
  }
	logger.warn(
		{ endpoint: 'ISteamUser.GetPlayerSummaries', status: result.status, steamid64: maskSteamId64(steamid64), visibilityShape: jsonShape(visibility) },
		'steam_visibility_unexpected_value'
	);
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

  const result = await fetchJson(url.toString(), timeoutMs, {
	endpoint: 'IPlayerService.GetOwnedGames',
	steamid64,
	appId
  });
  if (!result) return 'unknown';
  const json = result.json;
  if (!isRecord(json)) {
	logger.warn(
		{ endpoint: 'IPlayerService.GetOwnedGames', status: result.status, rootShape: jsonShape(json), steamid64: maskSteamId64(steamid64), appId },
		'steam_api_unexpected_response_shape'
	);
	return 'unknown';
  }
  const response = json.response;
  if (!isRecord(response)) {
	logger.warn(
		{ endpoint: 'IPlayerService.GetOwnedGames', status: result.status, responseShape: jsonShape(response), steamid64: maskSteamId64(steamid64), appId },
		'steam_api_unexpected_response_shape'
	);
	return 'unknown';
  }
  const gameCount = response.game_count;
  if (typeof gameCount === 'number') {
    return gameCount > 0 ? 'owned' : 'not_owned';
  }
	logger.warn(
		{ endpoint: 'IPlayerService.GetOwnedGames', status: result.status, steamid64: maskSteamId64(steamid64), appId, gameCountShape: jsonShape(gameCount) },
		'steam_owned_games_unexpected_value'
	);
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
    logger.warn(
      { steamid64: maskSteamId64(steamid64), appId },
      'steam_visibility_unknown'
    );
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
  logger.warn(
    { steamid64: maskSteamId64(steamid64), appId },
    'steam_ownership_unknown'
  );
  return { ok: false, error: 'steam_api_unavailable' };
}
