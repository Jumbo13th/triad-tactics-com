import crypto from 'crypto';
import type { SteamAuthDeps } from '../ports';

function sanitizeRedirectPath(value: string | null): string {
  if (!value) return '/';
  // Only allow relative paths to prevent open redirects.
  if (!value.startsWith('/')) return '/';
  if (value.startsWith('//')) return '/';
  return value;
}

function buildSteamOpenIdRedirect(origin: string, returnTo: string): string {
  const url = new URL('https://steamcommunity.com/openid/login');
  url.searchParams.set('openid.ns', 'http://specs.openid.net/auth/2.0');
  url.searchParams.set('openid.mode', 'checkid_setup');
  url.searchParams.set('openid.return_to', returnTo);
  url.searchParams.set('openid.realm', origin);
  url.searchParams.set('openid.identity', 'http://specs.openid.net/auth/2.0/identifier_select');
  url.searchParams.set('openid.claimed_id', 'http://specs.openid.net/auth/2.0/identifier_select');
  return url.toString();
}

export type StartSteamLoginInput = {
  origin: string;
  redirectParam: string | null;
};

export type StartSteamLoginResult =
  | {
      ok: true;
      sessionId: string;
      steamLoginUrl: string;
      redirectPath: string;
    }
  | { ok: false; error: 'server_error' };

export function startSteamLogin(deps: SteamAuthDeps, input: StartSteamLoginInput): StartSteamLoginResult {
  const redirectPath = sanitizeRedirectPath(input.redirectParam);

  const sessionId = crypto.randomUUID();
  const created = deps.sessions.createSteamSession({ id: sessionId, redirect_path: redirectPath });
  if (!created.success) {
    return { ok: false, error: 'server_error' };
  }

  const returnTo = new URL('/api/auth/steam/callback', input.origin);
  returnTo.searchParams.set('sid', sessionId);

  const steamLoginUrl = buildSteamOpenIdRedirect(input.origin, returnTo.toString());

  return {
    ok: true,
    sessionId,
    steamLoginUrl,
    redirectPath
  };
}
