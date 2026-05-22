import type { SteamAuthDeps } from '@/features/steamAuth/ports';
import type { UserStatus } from '@/features/users/domain/api';
import { getSteamIdentity } from '@/features/steamAuth/useCases/getSteamIdentity';
import { getActiveSiteBanForUser, getActiveServerBanForUser } from '@/features/sanctions/infra/sqliteSanctions';

export function getUserStatus(deps: SteamAuthDeps, sid: string | null): UserStatus {
	const identity = getSteamIdentity(deps, sid);
	if (!identity.connected) return { connected: false };

	// Ensure we have a user record even if they haven't applied.
	deps.users.upsertUser({ steamid64: identity.steamid64 });

	const user = deps.users.getUserBySteamId64(identity.steamid64);
	const existing = user?.id ? deps.applications.getByUserId(user.id) : null;
	const renameRequired = !!user?.rename_required_at;
	const hasPendingRenameRequest = user?.id ? deps.renameRequests.hasPendingByUserId(user.id) : false;
	const latestDeclineReason = user?.id ? deps.renameRequests.getLatestDeclineReasonByUserId(user.id) : null;
	const renameRequiredBySteamId64 = user?.rename_required_by_steamid64 ?? null;
	const renameRequiredByCallsign = renameRequiredBySteamId64
		? (deps.users.getUserBySteamId64(renameRequiredBySteamId64)?.current_callsign ?? null)
		: null;
	const isAdmin = deps.admin.isAdminSteamId(identity.steamid64);
	const accessLevel: 'guest' | 'player' | 'admin' = isAdmin
		? 'admin'
		: user?.player_confirmed_at
			? 'player'
			: 'guest';

	const badges = user?.id && deps.users.getBadgeLabelsByUserId
		? deps.users.getBadgeLabelsByUserId(user.id)
		: [];

	const armaGuid = user?.arma_guid ?? null;
	const isConfirmed = !!user?.player_confirmed_at;
	const armaGuidRequired = isConfirmed && !armaGuid;

	let siteBanned = false;
	let siteBanReason: string | null = null;
	let siteBanExpiresAt: string | null = null;
	let serverBanned = false;
	if (user?.id) {
		const ban = getActiveSiteBanForUser({ userId: user.id });
		if (ban) {
			siteBanned = true;
			siteBanReason = ban.reason ?? null;
			siteBanExpiresAt = ban.expires_at ?? null;
		}
		serverBanned = getActiveServerBanForUser({ userId: user.id }) !== null;
	}

	return {
		connected: true,
		steamid64: identity.steamid64,
		personaName: identity.personaName,
		currentCallsign: user?.current_callsign ?? null,
		discordId: user?.discord_id ?? null,
		armaGuid,
		hasExisting: !!existing,
		submittedAt: existing?.created_at ?? null,
		renameRequired,
		hasPendingRenameRequest,
		renameRequiredReason: latestDeclineReason ?? user?.rename_required_reason ?? null,
		renameRequiredBySteamId64,
		renameRequiredByCallsign,
		armaGuidRequired,
		accessLevel,
		badges,
		siteBanned,
		siteBanReason,
		siteBanExpiresAt,
		serverBanned
	};
}
