import {
	archiveGame,
	cancelGame,
	claimPrioritySlot,
	claimUnitSlot,
	countCompletedGameParticipations,
	userIsInSquadOrHasBadge,
	createMissionUpdate,
	releaseUnitGameplay,
	hideUnitGameplay,
	updateMissionUpdate,
	createDraft,
	deleteArchivedMission,
	deleteCurrentDraft,
	getArchivedGameSummaries,
	getMissionById,
	getGameByShortCode,
	getAdminGamesOverview,
	getCurrentPublishedSummary,
	getMissionAuditHistory,
	hidePriorityGameplay,
	hideRegularGameplay,
	joinRegularGame,
	leavePrioritySlot,
	leaveRegularGame,
	publishMission,
	releasePriorityGameplay,
	releaseRegularGameplay,
	releaseUnitSlot,
	switchPrioritySlot,
	updateSlotting,
	updateSettings,
	updateUnitAssignments
} from './infra/sqliteGames';
import type {
	ArchiveGameDeps,
	CancelGameDeps,
	ClaimPrioritySlotDeps,
	CreateMissionUpdateDeps,
	CreateGameDraftDeps,
	DeleteArchivedMissionDeps,
	DeleteCurrentDraftDeps,
	GetAdminGameMissionDeps,
	GetGameArchiveSummariesDeps,
	GetGameByShortCodeDeps,
	GetAdminGamesOverviewDeps,
	GetCurrentGameDeps,
	GetMissionAuditDeps,
	GetIsEstablishedPlayerDeps,
	HidePriorityGameplayDeps,
	HideRegularGameplayDeps,
	JoinRegularGameDeps,
	LeavePrioritySlotDeps,
	LeaveRegularGameDeps,
	PublishGameDeps,
	ReleasePriorityGameplayDeps,
	ReleaseRegularGameplayDeps,
	SwitchPrioritySlotDeps,
	UpdateGameSlottingDeps,
	UpdateGameSettingsDeps,
	UpdateMissionUpdateDeps,
	UpdateUnitAssignmentsDeps,
	ClaimUnitSlotDeps,
	ReleaseUnitSlotDeps,
	ReleaseUnitGameplayDeps,
	HideUnitGameplayDeps
} from './ports';

export const getAdminGamesOverviewDeps: GetAdminGamesOverviewDeps = {
	repo: {
		getAdminGamesOverview
	}
};

export const createGameDraftDeps: CreateGameDraftDeps = {
	repo: {
		createDraft
	}
};

export const deleteCurrentDraftDeps: DeleteCurrentDraftDeps = {
	repo: {
		deleteCurrentDraft
	}
};

export const getAdminGameMissionDeps: GetAdminGameMissionDeps = {
	repo: {
		getMissionById
	}
};

export const updateGameSettingsDeps: UpdateGameSettingsDeps = {
	repo: {
		updateSettings
	}
};

export const publishGameDeps: PublishGameDeps = {
	repo: {
		publishMission
	}
};

export const releasePriorityGameplayDeps: ReleasePriorityGameplayDeps = {
	repo: {
		releasePriorityGameplay
	}
};

export const releaseRegularGameplayDeps: ReleaseRegularGameplayDeps = {
	repo: {
		releaseRegularGameplay
	}
};

export const hidePriorityGameplayDeps: HidePriorityGameplayDeps = {
	repo: {
		hidePriorityGameplay
	}
};

export const hideRegularGameplayDeps: HideRegularGameplayDeps = {
	repo: {
		hideRegularGameplay
	}
};

export const archiveGameDeps: ArchiveGameDeps = {
	repo: {
		archiveGame
	}
};

export const cancelGameDeps: CancelGameDeps = {
	repo: {
		cancelGame
	}
};

export const deleteArchivedMissionDeps: DeleteArchivedMissionDeps = {
	repo: {
		deleteArchivedMission
	}
};

export const getMissionAuditDeps: GetMissionAuditDeps = {
	repo: {
		getMissionAuditHistory
	}
};

export const createMissionUpdateDeps: CreateMissionUpdateDeps = {
	repo: {
		createMissionUpdate
	}
};

export const updateMissionUpdateDeps: UpdateMissionUpdateDeps = {
	repo: {
		updateMissionUpdate
	}
};

export const updateGameSlottingDeps: UpdateGameSlottingDeps = {
	repo: {
		updateSlotting
	}
};

export const getCurrentGameDeps: GetCurrentGameDeps = {
	repo: {
		getCurrentPublishedSummary
	}
};

export const getIsEstablishedPlayerDeps: GetIsEstablishedPlayerDeps = {
	repo: {
		countCompletedGameParticipations,
		userIsInSquadOrHasBadge
	}
};

export const getGameArchiveSummariesDeps: GetGameArchiveSummariesDeps = {
	repo: {
		getArchivedGameSummaries
	}
};

export const getGameByShortCodeDeps: GetGameByShortCodeDeps = {
	repo: {
		getGameByShortCode
	}
};

export const claimPrioritySlotDeps: ClaimPrioritySlotDeps = {
	repo: {
		claimPrioritySlot
	}
};

export const switchPrioritySlotDeps: SwitchPrioritySlotDeps = {
	repo: {
		switchPrioritySlot
	}
};

export const leavePrioritySlotDeps: LeavePrioritySlotDeps = {
	repo: {
		leavePrioritySlot
	}
};

export const joinRegularGameDeps: JoinRegularGameDeps = {
	repo: {
		joinRegularGame
	}
};

export const leaveRegularGameDeps: LeaveRegularGameDeps = {
	repo: {
		leaveRegularGame
	}
};

export const updateUnitAssignmentsDeps: UpdateUnitAssignmentsDeps = {
	repo: {
		updateUnitAssignments
	}
};

export const claimUnitSlotDeps: ClaimUnitSlotDeps = {
	repo: {
		claimUnitSlot
	}
};

export const releaseUnitSlotDeps: ReleaseUnitSlotDeps = {
	repo: {
		releaseUnitSlot
	}
};

export const releaseUnitGameplayDeps: ReleaseUnitGameplayDeps = {
	repo: {
		releaseUnitGameplay
	}
};

export const hideUnitGameplayDeps: HideUnitGameplayDeps = {
	repo: {
		hideUnitGameplay
	}
};
