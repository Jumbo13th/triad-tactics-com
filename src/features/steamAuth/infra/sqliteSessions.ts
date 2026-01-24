import type { SteamSession } from '@/features/steamAuth/domain/types';
import { getDb } from '@/platform/db/connection';

type SteamSessionRow = {
	id: string;
	redirect_path: string;
	steamid64: string | null;
	persona_name: string | null;
	created_at: string;
};

export function createSteamSession(session: { id: string; redirect_path: string }) {
	const db = getDb();
	const stmt = db.prepare(`
		INSERT INTO steam_sessions (id, redirect_path)
		VALUES (?, ?)
	`);

	try {
		stmt.run(session.id, session.redirect_path);
		return { success: true } as const;
	} catch {
		return { success: false, error: 'database_error' } as const;
	}
}

export function setSteamSessionIdentity(
	sessionId: string,
	identity: { steamid64: string; persona_name?: string | null }
) {
	const db = getDb();
	const stmt = db.prepare(`
		UPDATE steam_sessions
		SET steamid64 = ?, persona_name = ?
		WHERE id = ?
	`);

	try {
		const info = stmt.run(identity.steamid64, identity.persona_name ?? null, sessionId);
		return { success: info.changes > 0 } as const;
	} catch {
		return { success: false, error: 'database_error' } as const;
	}
}

export function getSteamSession(sessionId: string): SteamSession | null {
	const db = getDb();
	const stmt = db.prepare(`
		SELECT id, redirect_path, steamid64, persona_name, created_at
		FROM steam_sessions
		WHERE id = ?
	`);

	const row = stmt.get(sessionId) as SteamSessionRow | undefined;
	if (!row) return null;
	return row;
}

export function deleteSteamSession(sessionId: string) {
	const db = getDb();
	const stmt = db.prepare(`
		DELETE FROM steam_sessions
		WHERE id = ?
	`);

	try {
		stmt.run(sessionId);
		return { success: true } as const;
	} catch {
		return { success: false, error: 'database_error' } as const;
	}
}
