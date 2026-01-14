import { errorToLogObject, logger } from '@/platform/logger';
import { fetchWithLogging, redactUrl } from '@/platform/http';

const DEFAULT_TIMEOUT_MS = 5000;

export type SteamVerificationResult =
  | { ok: true }
  | { ok: false; error: 'steam_not_detected' | 'steam_api_unavailable' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function jsonShape(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

async function safeReadBodySnippet(res: Response, limit = 8 * 1024): Promise<string | undefined> {
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
          steamid64: meta.steamid64,
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
          steamid64: meta.steamid64,
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
        steamid64: meta.steamid64,
        appId: meta.appId,
        url: redactUrl(url)
      },
      'steam_api_fetch_failed'
    );
    return null;
  }
}
type OwnedGameCheck =
  | { status: 'owned' }
  | {
    status: 'not_detected';
    reason:
    | 'not_owned'
    | 'private_or_hidden'
    | 'unexpected_shape'
    | 'missing_game_count'
    | 'missing_games_list';
  }
  | { status: 'api_unavailable'; reason: 'http_error' | 'fetch_error' | 'json_parse_error' };

async function checkOwnedGame(
  steamApiKey: string,
  steamid64: string,
  appId: number,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<OwnedGameCheck> {
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
  if (!result) return { status: 'api_unavailable', reason: 'fetch_error' };
  const json = result.json;
  if (!isRecord(json)) {
    logger.warn(
      { endpoint: 'IPlayerService.GetOwnedGames', status: result.status, rootShape: jsonShape(json), steamid64, appId },
      'steam_api_unexpected_response_shape'
    );
    return { status: 'not_detected', reason: 'unexpected_shape' };
  }
  const response = json.response;
  if (!isRecord(response)) {
    logger.warn(
      { endpoint: 'IPlayerService.GetOwnedGames', status: result.status, responseShape: jsonShape(response), steamid64, appId },
      'steam_api_unexpected_response_shape'
    );
    return { status: 'not_detected', reason: 'unexpected_shape' };
  }
  if (Object.keys(response).length === 0) {
    logger.info(
      { endpoint: 'IPlayerService.GetOwnedGames', status: result.status, steamid64, appId },
      'steam_owned_games_empty_response'
    );
    return { status: 'not_detected', reason: 'private_or_hidden' };
  }

  const gameCount = response.game_count;
  if (typeof gameCount === 'number') {
    return gameCount > 0 ? { status: 'owned' } : { status: 'not_detected', reason: 'not_owned' };
  }

  const games = response.games;
  if (Array.isArray(games)) {
    return games.length > 0 ? { status: 'owned' } : { status: 'not_detected', reason: 'not_owned' };
  }
  logger.warn(
    { endpoint: 'IPlayerService.GetOwnedGames', status: result.status, steamid64, appId, gameCountShape: jsonShape(gameCount) },
    'steam_owned_games_unexpected_value'
  );
  if (gameCount === undefined && games === undefined) {
    return { status: 'not_detected', reason: 'missing_game_count' };
  }
  if (!Array.isArray(games)) {
    return { status: 'not_detected', reason: 'missing_games_list' };
  }
  return { status: 'not_detected', reason: 'unexpected_shape' };
}

export async function verifySteamOwnsGameOrReject(
  steamApiKey: string,
  steamid64: string,
  appId: number
): Promise<SteamVerificationResult> {
  const owned = await checkOwnedGame(steamApiKey, steamid64, appId);
  if (owned.status === 'owned') return { ok: true };

  if (owned.status === 'api_unavailable') {
    logger.warn(
      { steamid64, appId, reason: owned.reason },
      'steam_ownership_api_unavailable'
    );
    return { ok: false, error: 'steam_api_unavailable' };
  }

  logger.info(
    { steamid64, appId, reason: owned.reason },
    'steam_ownership_not_detected'
  );
  return { ok: false, error: 'steam_not_detected' };
}
