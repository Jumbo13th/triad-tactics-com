import type { SteamAuthDeps } from '../ports';

export type SteamIdentityResult =
	| { connected: false }
	| { connected: true; steamid64: string; personaName: string | null };

export function getSteamIdentity(deps: SteamAuthDeps, sid: string | null): SteamIdentityResult {
	if (!sid) {
		return { connected: false };
	}

	const session = deps.sessions.getSteamSession(sid);
	if (!session?.steamid64) {
		return { connected: false };
	}

	return {
		connected: true,
		steamid64: session.steamid64,
		personaName: session.persona_name ?? null
	};
}
