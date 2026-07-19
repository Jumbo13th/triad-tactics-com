import type { StatsSnapshot } from './domain/snapshot';
import type { GameStatsMeta, Season, StatsMapping, UnitScore, UnitScoreWithUnit } from './domain/types';

export type MatchedPlayer = {
	userId: number;
	callsign: string;
	unitId: number | null;
	unitTag: string | null;
	unitName: string | null;
};

export type UnitRef = {
	unitId: number;
	tag: string;
	name: string;
};

// For the admin upload form's mission picker.
export type MissionOption = {
	id: number;
	title: string;
	shortCode: string;
	status: string;
	startsAt: string; // ISO, '' when unscheduled — disambiguates recurring titles
};

export type StandingsAggregate = {
	unitId: number;
	unitTag: string;
	unitName: string;
	rawPoints: number;
	games: number;
	wins: number;
	commandWins: number;
	kills: number;
	deaths: number;
	teamkills: number;
	totalParticipants: number;
};

export type UnitHistoryEntry = {
	game: GameStatsMeta;
	score: UnitScore;
};

export type StatsRepo = {
	// Seasons (at most one active — enforced by the schema).
	createSeason: (input: { name: string; createdBySteamid64: string }) => Season | 'active_season_exists';
	closeSeason: (seasonId: number) => boolean;
	getActiveSeason: () => Season | null;
	getSeason: (seasonId: number) => Season | null;
	listSeasons: () => Season[];

	// Hides the statistics teaser on the MAIN PAGE only (live-testing toggle);
	// /stats and the gameserver endpoints ignore it.
	getStatsHidden: () => boolean;
	setStatsHidden: (hidden: boolean) => void;

	// Game stats records.
	missionTitle: (missionId: number) => string | null;
	findByHash: (hash: string) => GameStatsMeta | null;
	findByMissionEpisode: (missionId: number, episodeNumber: number) => GameStatsMeta | null;
	insertDraft: (input: {
		missionId: number;
		episodeNumber: number;
		snapshotJson: string;
		snapshotHash: string;
		configJson: string;
		mappingJson: string;
		winnerSide: string;
		missionName: string;
		playedAt: string;
		uploadedBySteamid64: string;
	}) => number;
	replaceDraft: (gameStatsId: number, input: {
		snapshotJson: string;
		snapshotHash: string;
		configJson: string;
		mappingJson: string;
		winnerSide: string;
		missionName: string;
		playedAt: string;
		uploadedBySteamid64: string;
	}) => void;
	getMeta: (gameStatsId: number) => GameStatsMeta | null;
	getSnapshot: (gameStatsId: number) => StatsSnapshot | null;
	getMapping: (gameStatsId: number) => StatsMapping;
	updateMapping: (gameStatsId: number, mapping: StatsMapping) => void;
	publish: (gameStatsId: number, input: {
		seasonId: number | null;
		winnerSide: string;
		rows: UnitScore[];
		publishedBySteamid64: string;
	}) => void;
	unpublish: (gameStatsId: number) => void;
	// Drafts only — published games must be unpublished first.
	deleteDraft: (gameStatsId: number) => boolean;
	listGames: (input: { seasonId?: number | null; publishedOnly: boolean; limit: number; offset?: number }) => GameStatsMeta[];
	listGamesForMission: (missionId: number) => GameStatsMeta[];
	// For the mission archive page → its statistics episodes.
	findMissionIdByShortCode: (shortCode: string) => number | null;
	listMissionOptions: () => MissionOption[];

	// Computed rows + aggregates.
	getScores: (gameStatsId: number) => UnitScoreWithUnit[];
	getUnitHistory: (unitId: number) => UnitHistoryEntry[];
	getStandingsAggregates: (seasonId: number | null) => StandingsAggregate[];

	// Identity mapping helpers (arma_guid → user → unit, resolved at upload).
	findPlayersByGuids: (guids: string[]) => Record<string, MatchedPlayer>;
	findUnitsByTags: (tags: string[]) => Record<string, UnitRef>; // keyed by lowercase tag
	getUnitsByIds: (unitIds: number[]) => Record<number, UnitRef>;
	listAllUnits: () => UnitRef[];

	// Occupancy denominator: slots whose occupant belongs to each unit in the
	// episode's slotting (fallback: the mission's default slotting).
	getClaimedSlotsByUnit: (missionId: number, episodeNumber: number) => Record<number, number>;

	// Cheap probe that changes whenever published stats or seasons change —
	// the statsCached invalidation key.
	dataFingerprint: () => string;
};

export type StatsDeps = {
	repo: StatsRepo;
	// Season-ranking dampening exponent α (raw ÷ avgParticipants^α).
	balanceAlpha: number;
};
