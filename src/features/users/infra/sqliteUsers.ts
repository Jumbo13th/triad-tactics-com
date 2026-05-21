import type { User } from '@/features/users/domain/types';
import { decryptToken, encryptToken } from '@/platform/crypto/tokenCrypto';
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
	discord_id: string | null;
	arma_guid: string | null;
};

export function getOrCreateUserBySteamId64(input: { steamid64: string }) {
	const db = getDb();
	const steamid64 = input.steamid64.trim();
	const fallbackCallsign = `Steam_${steamid64}`;
	const select = db.prepare(`
		SELECT u.id, u.created_at, u.player_confirmed_at, u.confirmed_application_id,
			u.current_callsign, u.discord_id, u.arma_guid,
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
			u.current_callsign, u.discord_id, u.arma_guid,
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

export function getBadgeLabelsByUserId(userId: number): { label: string }[] {
	const db = getDb();
	const stmt = db.prepare(`
		SELECT bt.label
		FROM user_badges ub
		JOIN badge_types bt ON bt.id = ub.badge_type_id
		WHERE ub.user_id = ? AND bt.status = 'active'
		ORDER BY LOWER(bt.label) ASC
	`);
	return stmt.all(userId) as { label: string }[];
}

export function setArmaGuidByUserId(input: {
	userId: number;
	armaGuid: string;
}): { success: true } | { success: false; error: 'not_found' | 'duplicate' | 'database_error' } {
	const db = getDb();
	const stmt = db.prepare(`
		UPDATE users
		SET arma_guid = ?
		WHERE id = ?
	`);
	try {
		const info = stmt.run(input.armaGuid, input.userId);
		if (info.changes === 0) return { success: false, error: 'not_found' };
		return { success: true };
	} catch (error: unknown) {
		const code =
			typeof error === 'object' && error !== null && 'code' in error
				? (error as { code: string }).code
				: '';
		if (code === 'SQLITE_CONSTRAINT_UNIQUE') {
			return { success: false, error: 'duplicate' };
		}
		return { success: false, error: 'database_error' };
	}
}

export function isArmaGuidTaken(armaGuid: string, excludeUserId?: number): boolean {
	const db = getDb();
	if (excludeUserId != null) {
		const stmt = db.prepare(`
			SELECT 1 FROM users
			WHERE LOWER(arma_guid) = LOWER(?) AND id != ?
			LIMIT 1
		`);
		return !!stmt.get(armaGuid, excludeUserId);
	}
	const stmt = db.prepare(`
		SELECT 1 FROM users
		WHERE LOWER(arma_guid) = LOWER(?)
		LIMIT 1
	`);
	return !!stmt.get(armaGuid);
}

export function setDiscordIdentityByUserId(input: {
	userId: number;
	discordId: string;
	discordToken: string;
}) {
	const db = getDb();
	try {
		const updateDiscordId = db.prepare(`
			UPDATE users
			SET discord_id = ?
			WHERE id = ?
		`);
		const run = db.transaction(() => {
			const info = updateDiscordId.run(input.discordId, input.userId);
			if (info.changes === 0) return false;

			const saved = saveDiscordToken({ userId: input.userId, discordToken: input.discordToken });
			if (!saved.success) throw new Error('discord_token_save_failed');
			return true;
		});
		return { success: run() };
	} catch {
		return { success: false, error: 'database_error' as const };
	}
}

export function saveDiscordToken(input: { userId: number; discordToken: string }) {
	const db = getDb();
	const encrypted = encryptToken(input.discordToken);
	const stmt = db.prepare(`
		UPDATE users
		SET discord_token_encrypted = ?,
			discord_token_iv = ?
		WHERE id = ?
	`);

	try {
		const info = stmt.run(encrypted.encryptedToken, encrypted.iv, input.userId);
		return { success: info.changes > 0 } as const;
	} catch {
		return { success: false, error: 'database_error' as const };
	}
}

type DiscordTokenRow = {
	discord_token_encrypted?: string | null;
	discord_token_iv?: string | null;
};

export function getDiscordTokenByUserId(userId: number): string | null {
	const db = getDb();
	const row = db
		.prepare(
			`
			SELECT discord_token_encrypted, discord_token_iv
			FROM users
			WHERE id = ?
		`
		)
		.get(userId) as DiscordTokenRow | undefined;
	if (!row) return null;

	if (row.discord_token_encrypted && row.discord_token_iv) {
		return decryptToken({
			encryptedToken: row.discord_token_encrypted,
			iv: row.discord_token_iv
		});
	}
	return null;
}
