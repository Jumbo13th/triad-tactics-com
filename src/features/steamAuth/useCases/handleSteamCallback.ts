import type { SteamAuthDeps } from '../ports';

function extractSteamId64(claimedId: string | null): string | null {
  if (!claimedId) return null;
  const match = claimedId.match(/\/openid\/id\/(\d{17})$/);
  return match ? match[1] : null;
}

export type HandleSteamCallbackInput = {
  sidFromQuery: string | null;
  sidFromCookie: string | null;
  query: URLSearchParams;
  steamWebApiKey: string | undefined;
};

export type HandleSteamCallbackResult = {
  redirectPath: string;
};

export async function handleSteamCallback(
	deps: SteamAuthDeps,
	input: HandleSteamCallbackInput
): Promise<HandleSteamCallbackResult> {
  const sid = input.sidFromQuery;
  const cookieSid = input.sidFromCookie;

  if (!sid || !cookieSid || sid !== cookieSid) {
    return { redirectPath: '/' };
  }

  const session = deps.sessions.getSteamSession(sid);
  if (!session) {
    return { redirectPath: '/' };
  }

  const redirectPath = session.redirect_path || '/';

  const mode = input.query.get('openid.mode');
  if (mode !== 'id_res') {
    return { redirectPath };
  }

  const isValid = await deps.openId.verifyAssertion(input.query);
  if (!isValid) {
    return { redirectPath };
  }

  const claimedId = input.query.get('openid.claimed_id') || input.query.get('openid.identity');
  const steamid64 = extractSteamId64(claimedId);

  if (!steamid64) {
    return { redirectPath };
  }

  const personaName = input.steamWebApiKey
		? await deps.persona.fetchPersonaName(input.steamWebApiKey, steamid64)
		: null;

  deps.sessions.setSteamSessionIdentity(sid, {
    steamid64,
    persona_name: personaName
  });

  // Persist user identity for access control.
  deps.users.upsertUser({ steamid64 });

  return { redirectPath };
}
