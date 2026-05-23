import { getDb } from '@/platform/db/connection';
import type { GameserverActiveBan, GameserverPlayer, GameserverPlayerUnit } from '../domain/types';

type PlayerRow = {
	user_id: number;
	callsign: string;
	steam_id: string;
	discord_id: string | null;
	arma_id: string;
};

type BadgeRow = {
	label: string;
};

type UnitRow = {
	name: string;
	tag: string;
	role: string;
};

type BanRow = {
	type: 'site_ban' | 'server_ban';
	reason: string;
	expires_at: string | null;
};

const ACTIVE_BAN_CONDITION = `cancelled_at IS NULL AND (expires_at IS NULL OR expires_at > datetime('now'))`;

export function getPlayerByArmaId(input: { armaId: string }): GameserverPlayer | null {
	const db = getDb();

	const playerStmt = db.prepare(`
		SELECT
			u.id AS user_id,
			u.current_callsign AS callsign,
			ui.provider_user_id AS steam_id,
			u.discord_id,
			u.arma_guid AS arma_id
		FROM users u
		JOIN user_identities ui ON ui.user_id = u.id AND ui.provider = 'steam'
		WHERE LOWER(u.arma_guid) = LOWER(?)
		LIMIT 1
	`);
	const player = playerStmt.get(input.armaId) as PlayerRow | undefined;
	if (!player) return null;

	const badgesStmt = db.prepare(`
		SELECT bt.label
		FROM user_badges ub
		JOIN badge_types bt ON bt.id = ub.badge_type_id
		WHERE ub.user_id = ? AND bt.status = 'active'
		ORDER BY LOWER(bt.label) ASC
	`);
	const badges = (badgesStmt.all(player.user_id) as BadgeRow[]).map((b) => b.label);

	const unitStmt = db.prepare(`
		SELECT u.name, u.tag, um.role
		FROM unit_memberships um
		JOIN units u ON u.id = um.unit_id
		WHERE um.user_id = ? AND um.role IN ('member', 'deputy', 'leader')
		LIMIT 1
	`);
	const unit = (unitStmt.get(player.user_id) as UnitRow | undefined) ?? null;

	const bansStmt = db.prepare(`
		SELECT type, reason, expires_at
		FROM sanctions
		WHERE user_id = ? AND type IN ('site_ban', 'server_ban') AND ${ACTIVE_BAN_CONDITION}
		ORDER BY created_at DESC
	`);
	const activeBans = bansStmt.all(player.user_id) as BanRow[];

	const unitResult: GameserverPlayerUnit | null = unit
		? { name: unit.name, tag: unit.tag, role: unit.role }
		: null;

	const bansResult: GameserverActiveBan[] = activeBans.map((b) => ({
		type: b.type,
		reason: b.reason,
		expires_at: b.expires_at,
	}));

	return {
		callsign: player.callsign,
		steam_id: player.steam_id,
		discord_id: player.discord_id,
		arma_id: player.arma_id,
		badges,
		unit: unitResult,
		active_bans: bansResult,
	};
}
