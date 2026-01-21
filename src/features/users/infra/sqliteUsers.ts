import type { User } from '@/features/users/domain/types';
import { getDb } from '@/platform/db/connection';

type UserRow = {
	id: number;
	created_at: string;
	player_confirmed_at: string | null;
	confirmed_application_id: number | null;
	current_callsign: string | null;
	rename_required_at: string | null;
	rename_required_reason: string | null;
	rename_required_by_steamid64: string | null;
};

export function getOrCreateUserBySteamId64(input: { steamid64: string }) {
	const db = getDb();
	const steamid64 = input.steamid64.trim();
	const fallbackCallsign = `Steam_${steamid64}`;
	const select = db.prepare(`
		SELECT u.id, u.created_at, u.player_confirmed_at, u.confirmed_application_id,
			u.current_callsign,
			rr.required_at as rename_required_at,
			rr.reason as rename_required_reason,
			rr.required_by_steamid64 as rename_required_by_steamid64
		FROM user_identities ui
		JOIN users u ON u.id = ui.user_id
		LEFT JOIN rename_requirements rr ON rr.user_id = u.id
		WHERE ui.provider = 'steam' AND ui.provider_user_id = ?
	`);
	const insertUser = db.prepare(`
		INSERT INTO users (current_callsign)
		VALUES (?)
	`);
	const insertIdentity = db.prepare(`
		INSERT INTO user_identities (user_id, provider, provider_user_id)
		VALUES (?, 'steam', ?)
	`);

	try {
		const run = db.transaction(() => {
			const existing = select.get(steamid64) as UserRow | undefined;
			if (existing) {
				return existing;
			}

			const info = insertUser.run(fallbackCallsign);
			const userIdRaw = info.lastInsertRowid;
			const userId = typeof userIdRaw === 'bigint' ? Number(userIdRaw) : (userIdRaw as number);
			insertIdentity.run(userId, steamid64);
			const created = select.get(steamid64) as UserRow | undefined;
			if (!created) throw new Error('user_create_failed');
			return created;
		});
		return { success: true as const, user: run() as User };
	} catch {
		return { success: false as const, error: 'database_error' as const };
	}
}

export function upsertUser(user: { steamid64: string }) {
	const result = getOrCreateUserBySteamId64({ steamid64: user.steamid64 });
	if (!result.success) return { success: false as const, error: 'database_error' as const };
	return { success: true as const, userId: result.user.id };
}

export function getUserBySteamId64(steamid64: string): User | null {
	const db = getDb();
	const stmt = db.prepare(`
		SELECT u.id, u.created_at, u.player_confirmed_at, u.confirmed_application_id,
			u.current_callsign,
			rr.required_at as rename_required_at,
			rr.reason as rename_required_reason,
			rr.required_by_steamid64 as rename_required_by_steamid64
		FROM user_identities ui
		JOIN users u ON u.id = ui.user_id
		LEFT JOIN rename_requirements rr ON rr.user_id = u.id
		WHERE ui.provider = 'steam' AND ui.provider_user_id = ?
	`);

	const row = stmt.get(steamid64) as UserRow | undefined;
	if (!row) return null;
	return row;
}

export function hasPendingRenameRequestByUserId(userId: number) {
	const db = getDb();
	const stmt = db.prepare(`
		SELECT 1
		FROM rename_requests
		WHERE user_id = ? AND status = 'pending'
		LIMIT 1
	`);
	return !!stmt.get(userId);
}

export function getLatestDeclineReasonByUserId(userId: number) {
	const db = getDb();
	const stmt = db.prepare(`
		SELECT decline_reason
		FROM rename_requests
		WHERE user_id = ?
			AND status = 'declined'
			AND decline_reason IS NOT NULL
			AND TRIM(decline_reason) != ''
		ORDER BY decided_at DESC, created_at DESC
		LIMIT 1
	`);
	const row = stmt.get(userId) as { decline_reason?: string | null } | undefined;
	const reason = row?.decline_reason ?? null;
	return reason && reason.trim() ? reason : null;
}
