// Unit-focused game statistics: the unit is the entity, never the player.
// The website recomputes scores from raw snapshots and freezes them at
// publish; the GUID→unit mapping made at upload never follows later roster
// changes.

export type Season = {
	id: number;
	name: string;
	status: 'active' | 'closed';
	startsAt: string;
	endsAt: string | null;
};

export type GameStatsStatus = 'draft' | 'published';

export type GameStatsMeta = {
	id: number;
	missionId: number;
	episodeNumber: number;
	seasonId: number | null;
	status: GameStatsStatus;
	winnerSide: string; // faction key, 'draw', or ''
	missionName: string;
	playedAt: string; // snapshot startedAt (server local time)
	snapshotHash: string;
	createdAt: string;
	publishedAt: string | null;
};

// Frozen at upload/publish: which unit every seen GUID belongs to (null =
// deliberately unmatched → earns nothing), plus the declared result.
export type StatsMapping = {
	guidUnit: Record<string, number | null>;
	winner: string; // faction key, 'draw', or ''
	commanders: { faction: string; unitId: number }[];
};

// One unit's computed line for one game, keyed (unit, side) — a unit fielding
// players on both sides in one game gets one clean row per side.
export type UnitScore = {
	unitId: number;
	side: string; // faction key
	kills: number;
	zoneKills: number;
	aiKills: number;
	teamkills: number;
	deaths: number;
	survivors: number;
	participants: number;
	occupancyPct: number | null; // participants vs slots the unit claimed in the episode slotting
	// One bucket for ALL mission tasks (zone-pool shares + key-target shares) —
	// operator decision: they are the same economy, never reported separately.
	objectivePoints: number;
	basePoints: number;
	multiplier: number;
	finalPoints: number;
	isCommander: boolean;
	isWinnerSide: boolean;
};

export type UnitScoreWithUnit = UnitScore & {
	unitTag: string;
	unitName: string;
};

// Season leaderboard line. `balanced` is the ranking key: raw ÷ avg
// participants^α (α configurable) — big units stay structurally favored while
// sharp small units remain competitive. Raw and per-capita stay visible so the
// rating never becomes a black box.
export type StandingsRow = {
	rank: number;
	unitId: number;
	unitTag: string;
	unitName: string;
	balanced: number;
	rawPoints: number;
	perCapita: number;
	games: number;
	wins: number;
	commandWins: number;
	kills: number;
	deaths: number;
	teamkills: number;
	avgParticipants: number;
};

// Automap suggestion for one snapshot player, shown in the upload preview.
export type PlayerMappingPreview = {
	guid: string;
	name: string;
	callsign: string;
	snapshotUnitTag: string; // what the game believed (advisory)
	faction: string;
	participated: boolean;
	matchedUserId: number | null;
	matchedCallsign: string | null;
	matchedUnitId: number | null;
	matchedUnitTag: string | null;
	matchedUnitName: string | null;
	resolvedUnitId: number | null; // current mapping decision
};

export type GameTimelineEvent = {
	t: number;
	type: 'capture' | 'defense' | 'keytarget' | 'trigger';
	text: string;
};
