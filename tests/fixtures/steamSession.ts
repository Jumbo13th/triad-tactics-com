export type DbOperationsForSteamSession = {
	createSteamSession: (session: { id: string; redirect_path: string }) => { success: boolean };
	setSteamSessionIdentity: (
		sessionId: string,
		identity: { steamid64: string; persona_name?: string | null }
	) => { success: boolean };
};

export function createSteamSession(
	dbOperations: DbOperationsForSteamSession,
	opts: {
		steamid64: string;
		redirectPath?: string;
		personaName?: string;
		sessionId?: string;
	}
): string {
	const sid = opts.sessionId ?? crypto.randomUUID();
	dbOperations.createSteamSession({ id: sid, redirect_path: opts.redirectPath ?? '/en' });
	dbOperations.setSteamSessionIdentity(sid, {
		steamid64: opts.steamid64,
		persona_name: opts.personaName ?? 'Test Persona'
	});
	return sid;
}

export function createSteamCookieHeader(
	dbOperations: DbOperationsForSteamSession,
	opts: {
		steamid64: string;
		cookieName?: string;
		redirectPath?: string;
		personaName?: string;
	}
): { sessionId: string; cookieHeader: string } {
	const sessionId = createSteamSession(dbOperations, {
		steamid64: opts.steamid64,
		redirectPath: opts.redirectPath,
		personaName: opts.personaName
	});
	const cookieName = opts.cookieName ?? 'tt_steam_session';
	return { sessionId, cookieHeader: `${cookieName}=${sessionId}` };
}
