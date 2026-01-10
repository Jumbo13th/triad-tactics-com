import type { SteamAuthDeps } from '../ports';

export function logoutSteam(deps: SteamAuthDeps, sid: string | null) {
  if (sid) {
		deps.sessions.deleteSteamSession(sid);
  }

  return { success: true } as const;
}
