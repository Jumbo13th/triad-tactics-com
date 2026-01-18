import type { SteamAuthDeps } from '../ports';
import { getSteamIdentity } from './getSteamIdentity';

export type SteamStatusResult =
  | { connected: false }
  | {
      connected: true;
      steamid64: string;
      personaName: string | null;
  currentCallsign: string | null;
      hasExisting: boolean;
      submittedAt: string | null;
      renameRequired: boolean;
      hasPendingRenameRequest: boolean;
      renameRequiredReason: string | null;
      renameRequiredBySteamId64: string | null;
      accessLevel: 'guest' | 'player' | 'admin';
    };

export function getSteamStatus(deps: SteamAuthDeps, sid: string | null): SteamStatusResult {
  const identity = getSteamIdentity(deps, sid);
  if (!identity.connected) return { connected: false };

	// Ensure we have a user record even if they haven't applied.
  deps.users.upsertUser({ steamid64: identity.steamid64 });

  const user = deps.users.getUserBySteamId64(identity.steamid64);
  const existing = user?.id ? deps.applications.getByUserId(user.id) : null;
  const renameRequired = !!user?.rename_required_at;
	const hasPendingRenameRequest = user?.id ? deps.renameRequests.hasPendingByUserId(user.id) : false;
  const isAdmin = deps.admin.isAdminSteamId(identity.steamid64);
  const accessLevel: 'guest' | 'player' | 'admin' = isAdmin
    ? 'admin'
    : user?.player_confirmed_at
      ? 'player'
      : 'guest';

  return {
    connected: true,
    steamid64: identity.steamid64,
    personaName: identity.personaName,
    currentCallsign: user?.current_callsign ?? null,
    hasExisting: !!existing,
    submittedAt: existing?.created_at ?? null,
    renameRequired,
		hasPendingRenameRequest,
    renameRequiredReason: user?.rename_required_reason ?? null,
    renameRequiredBySteamId64: user?.rename_required_by_steamid64 ?? null,
    accessLevel
  };
}
