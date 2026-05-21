import type { CanonicalSlot, CanonicalSlotting, SlottingDestructiveChange } from './slotting';
import type { AppLocale } from '@/i18n/locales';

export type LocalizedDescription = Record<AppLocale, string>;

export type GameStatus = 'draft' | 'published' | 'archived';
export type GameArchiveStatus = 'completed' | 'canceled';
export type GamePriorityClaimManualState = 'default' | 'open' | 'closed';
export type GameUnitSlottingManualState = 'closed' | 'open';

export type GameUnitAssignment = {
	unitId: number;
	unitTag: string;
	unitName: string;
	sideId: string;
	slotsAllocated: number;
	episodeNumber: number;
};
export type GameDraftCreateMode = 'blank' | 'duplicate_previous';
export type GamePublishValidationError =
	| 'slotting_invalid'
	| 'short_code_required'
	| 'short_code_invalid'
	| 'starts_at_required'
	| 'server_name_required'
	| 'server_host_required'
	| 'server_port_required'
	| 'early_password_required'
	| 'priority_badge_required';

export type GameSlottingDestructiveChange = SlottingDestructiveChange;

export type GameArchiveSideScore = {
	sideId: string;
	sideName: string;
	score: number;
};

export type GameAuditPayload =
	| null
	| boolean
	| number
	| string
	| GameAuditPayload[]
	| { [key: string]: GameAuditPayload };

export type GameAuditEvent = {
	id: number;
	eventType: string;
	createdAt: string;
	actorUserId: number | null;
	actorSteamId64: string | null;
	actorCallsign: string | null;
	payload: GameAuditPayload;
};

export type GameMissionUpdateKind =
	| 'units_slotting_started'
	| 'priority_slotting_started'
	| 'regular_slotting_started'
	| 'game_started_wait_next_episode';

export type GameMissionUpdate = {
	id: number;
	kind: GameMissionUpdateKind;
	episodeNumber: number | null;
	totalEpisodes: number | null;
	createdAt: string;
	createdBySteamId64: string | null;
};

export type GameArchiveResult = {
	outcome: 'winner' | 'draw';
	winnerSideId: string | null;
	sideScores: GameArchiveSideScore[];
};

export type EpisodeSlotting = {
	episodeNumber: number;
	slotting: CanonicalSlotting;
	slottingRevision: number;
};

export type GameAdminMission = {
	id: number;
	shortCode: string | null;
	status: GameStatus;
	title: string;
	description: LocalizedDescription;
	startsAt: string | null;
	serverName: string;
	serverHost: string;
	serverPort: number | null;
	priorityClaimOpensAt: string | null;
	priorityClaimManualState: GamePriorityClaimManualState;
	regularJoinEnabled: boolean;
	unitGameplayReleasedAt: string | null;
	priorityGameplayReleasedAt: string | null;
	regularGameplayReleasedAt: string | null;
	publishedAt: string | null;
	archivedAt: string | null;
	archiveStatus: GameArchiveStatus | null;
	archiveReason: string | null;
	archiveResult: GameArchiveResult | null;
	createdAt: string;
	updatedAt: string;
	createdBySteamId64: string | null;
	updatedBySteamId64: string | null;
	publishedBySteamId64: string | null;
	archivedBySteamId64: string | null;
	slottingRevision: number;
	settingsRevision: number;
	earlyPassword: string | null;
	finalPassword: string | null;
	serverDetailsHidden: boolean;
	priorityBadgeTypeIds: number[];
	unitSlottingManualState: GameUnitSlottingManualState;
	unitAssignments: GameUnitAssignment[];
	updates: GameMissionUpdate[];
	slotting: CanonicalSlotting;
	episodeSlottings: EpisodeSlotting[];
};

export type AdminGamesOverview = {
	draft: GameAdminMission | null;
	published: GameAdminMission | null;
	archivedMissions: GameAdminMission[];
};

export type CurrentGameSummary = {
	shortCode: string;
	title: string;
	description: LocalizedDescription;
	startsAt: string | null;
};

export type GameArchiveSummary = {
	shortCode: string;
	title: string;
	description: LocalizedDescription;
	startsAt: string | null;
	archivedAt: string | null;
	archiveStatus: GameArchiveStatus;
	archiveReason: string | null;
	archiveResult: GameArchiveResult | null;
};

export type GameMissionPasswordStage = 'early' | 'final';

export type GameRegularJoinParticipant = {
	userId: number;
	callsign: string;
	joinedAt: string;
};

export type GameMissionPassword = {
	stage: GameMissionPasswordStage | null;
	value: string | null;
	waitingForViewerAccess: boolean;
	missedJoinWindow: boolean;
};

export type GameMissionViewer = {
	userId: number;
	steamId64: string;
	callsign: string | null;
	hasPriorityBadge: boolean;
	priorityBadgeLabels: string[];
	heldSlotId: string | null;
	heldSlotAccess: CanonicalSlot['access'] | null;
	joinedRegular: boolean;
	canClaimPriority: boolean;
	canSwitchPriority: boolean;
	canJoinRegular: boolean;
	canLeaveRegular: boolean;
	unitId: number | null;
	unitTag: string | null;
	unitSideId: string | null;
	unitSideByEpisode: Record<number, string>;
	isUnitLeader: boolean;
	canClaimUnitSlot: boolean;
	unitSlotsUsed: number;
	unitSlotsAllocated: number;
};

export type GameMissionDetail = {
	status: 'published' | 'archived';
	shortCode: string;
	title: string;
	description: LocalizedDescription;
	startsAt: string | null;
	serverName: string;
	serverHost: string;
	serverPort: number | null;
	serverDetailsHidden: boolean;
	priorityClaimOpensAt: string | null;
	priorityClaimManualState: GamePriorityClaimManualState;
	priorityClaimOpen: boolean;
	unitGameplayReleasedAt: string | null;
	priorityGameplayReleasedAt: string | null;
	regularJoinEnabled: boolean;
	regularJoinOpen: boolean;
	regularGameplayReleasedAt: string | null;
	unitSlottingOpen: boolean;
	slottingRevision: number;
	archivedAt: string | null;
	archiveStatus: GameArchiveStatus | null;
	archiveReason: string | null;
	archiveResult: GameArchiveResult | null;
	availablePrioritySlotCount: number;
	updates: GameMissionUpdate[];
	slotting: CanonicalSlotting;
	episodeSlottings: EpisodeSlotting[];
	activeEpisode: number;
	regularJoiners: GameRegularJoinParticipant[];
	password: GameMissionPassword;
	viewer: GameMissionViewer;
};
