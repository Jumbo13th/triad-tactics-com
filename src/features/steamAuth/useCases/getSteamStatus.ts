import type { SteamAuthDeps } from '../ports';
import { getSteamIdentity } from './getSteamIdentity';

export type SteamStatusResult =
  | { connected: false }
  | { connected: true; steamid64: string; personaName: string | null; hasExisting: boolean; submittedAt: string | null };

export function getSteamStatus(deps: SteamAuthDeps, sid: string | null): SteamStatusResult {
  const identity = getSteamIdentity(deps, sid);
  if (!identity.connected) return { connected: false };

  const existing = deps.applications.getBySteamId64(identity.steamid64);

  return {
    connected: true,
    steamid64: identity.steamid64,
    personaName: identity.personaName,
    hasExisting: !!existing,
    submittedAt: existing?.created_at ?? null
  };
}
