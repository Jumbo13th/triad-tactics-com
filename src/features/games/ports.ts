import type {
	AdminGamesOverview,
	CurrentGameSummary,
	GameArchiveSummary,
	GameAdminMission,
	GameAuditEvent,
	GameMissionDetail,
	GameDraftCreateMode,
	GameMode,
	GameSlottingDestructiveChange,
	GamePublishValidationError
} from './domain/types';
import type {
	ArchiveGameRequest,
	CancelGameRequest,
	CreateMissionUpdateRequest,
	DeleteArchivedMissionRequest,
	PublishGameRequest,
	UpdateGameSettingsRequest,
	UpdateGameSlottingRequest,
	UpdateUnitAssignmentsRequest
} from './domain/requests';

export type CreateGameDraftRepoResult =
	| { success: true; mission: GameAdminMission }
	| { success: false; error: 'draft_exists' | 'no_source_mission' | 'database_error' };

export type DeleteCurrentDraftRepoResult =
	| { success: true }
	| { success: false; error: 'not_found' | 'database_error' };

export type UpdateGameSettingsRepoResult =
	| { success: true; mission: GameAdminMission }
	| {
			success: false;
			error:
				| 'not_found'
				| 'settings_revision_conflict'
				| 'short_code_locked'
				| 'short_code_taken'
				| 'regular_join_requires_regular_slots'
				| 'badge_not_found'
				| 'database_error';
	  };

export type PublishGameRepoResult =
	| { success: true; mission: GameAdminMission }
	| {
			success: false;
			error:
				| 'not_found'
				| 'not_draft'
				| 'published_mission_exists'
				| 'settings_revision_conflict'
				| 'publish_validation_failed'
				| 'database_error';
			reasons?: GamePublishValidationError[];
	  };

export type ReleasePriorityGameplayRepoResult =
	| { success: true; mission: GameAdminMission }
	| {
			success: false;
			error: 'not_found' | 'not_published' | 'final_password_required' | 'already_released' | 'database_error';
	  };

export type ReleaseRegularGameplayRepoResult =
	| { success: true; mission: GameAdminMission }
	| {
			success: false;
			error:
				| 'not_found'
				| 'not_published'
				| 'priority_release_required'
				| 'final_password_required'
				| 'already_released'
				| 'database_error';
	  };

export type HidePriorityGameplayRepoResult =
	| { success: true; mission: GameAdminMission }
	| {
			success: false;
			error:
				| 'not_found'
				| 'not_published'
				| 'regular_release_hide_required'
				| 'already_hidden'
				| 'database_error';
	  };

export type HideRegularGameplayRepoResult =
	| { success: true; mission: GameAdminMission }
	| {
			success: false;
			error: 'not_found' | 'not_published' | 'already_hidden' | 'database_error';
	  };

export type ArchiveGameRepoResult =
	| { success: true; mission: GameAdminMission }
	| {
			success: false;
			error: 'not_found' | 'not_published' | 'already_archived' | 'archive_result_invalid' | 'database_error';
	  };

export type CancelGameRepoResult =
	| { success: true; mission: GameAdminMission }
	| {
			success: false;
			error: 'not_found' | 'not_published' | 'already_archived' | 'cancel_reason_required' | 'database_error';
	  };

export type GetMissionAuditRepoResult =
	| { success: true; events: GameAuditEvent[] }
	| {
			success: false;
			error: 'not_found' | 'database_error';
	  };

export type CreateMissionUpdateRepoResult =
	| { success: true; mission: GameAdminMission }
	| {
			success: false;
			error: 'not_found' | 'not_published' | 'database_error';
	  };

export type UpdateMissionUpdateRepoResult =
	| { success: true; mission: GameAdminMission }
	| {
			success: false;
			error: 'not_found' | 'not_published' | 'database_error';
	  };

export type GetAdminGameMissionRepoResult =
	| { success: true; mission: GameAdminMission }
	| {
			success: false;
			error: 'not_found' | 'database_error';
	  };

export type DeleteArchivedMissionRepoResult =
	| { success: true }
	| {
			success: false;
			error: 'not_found' | 'not_archived' | 'title_confirmation_mismatch' | 'database_error';
	  };

export type UpdateGameSlottingRepoResult =
	| { success: true; mission: GameAdminMission }
	| {
			success: false;
			error:
				| 'not_found'
				| 'slotting_invalid'
				| 'slotting_revision_conflict'
				| 'regular_join_requires_regular_slots'
				| 'destructive_change_requires_confirmation'
				| 'episode_not_found'
				| 'database_error';
			destructiveChanges?: GameSlottingDestructiveChange[];
	  };

export type ClaimPrioritySlotRepoResult =
	| { success: true }
	| {
			success: false;
			error:
				| 'mission_not_found'
				| 'slot_not_found'
				| 'claim_closed'
				| 'slot_taken'
				| 'claim_conflict'
				| 'already_has_slot'
				| 'badge_required'
				| 'database_error';
	  };

export type SwitchPrioritySlotRepoResult =
	| { success: true }
	| {
			success: false;
			error:
				| 'mission_not_found'
				| 'slot_not_found'
				| 'claim_closed'
				| 'slot_taken'
				| 'no_current_slot'
				| 'already_in_slot'
				| 'switch_conflict'
				| 'database_error';
	  };

export type LeavePrioritySlotRepoResult =
	| { success: true; left: boolean }
	| {
			success: false;
			error: 'mission_not_found' | 'no_current_slot' | 'leave_conflict' | 'database_error';
	  };

export type JoinRegularGameRepoResult =
	| { success: true; joined: boolean }
	| {
			success: false;
			error:
				| 'mission_not_found'
				| 'join_closed'
				| 'already_has_slot'
				| 'priority_slot_available'
				| 'database_error';
	  };

export type LeaveRegularGameRepoResult =
	| { success: true; left: boolean }
	| {
			success: false;
			error: 'mission_not_found' | 'database_error';
	  };

export type GetGameByShortCodeRepoResult =
	| { success: true; mission: GameMissionDetail }
	| {
			success: false;
			error: 'not_found' | 'database_error';
	  };

export type GetGameArchiveSummariesRepoResult =
	| { success: true; archive: GameArchiveSummary[] }
	| {
			success: false;
			error: 'database_error';
	  };

export type GamesAdminOverviewRepo = {
	getAdminGamesOverview: () => AdminGamesOverview;
};

export type GamesDraftRepo = {
	createDraft: (input: { mode: GameDraftCreateMode; gameMode?: GameMode; createdBySteamId64: string }) => CreateGameDraftRepoResult;
	deleteCurrentDraft: () => DeleteCurrentDraftRepoResult;
	getMissionById: (input: { missionId: number }) => GetAdminGameMissionRepoResult;
	updateSettings: (input: UpdateGameSettingsRequest & { missionId: number; updatedBySteamId64: string }) => UpdateGameSettingsRepoResult;
	publishMission: (input: PublishGameRequest & { missionId: number; publishedBySteamId64: string }) => PublishGameRepoResult;
	releasePriorityGameplay: (input: { missionId: number; releasedBySteamId64: string }) => ReleasePriorityGameplayRepoResult;
	releaseRegularGameplay: (input: { missionId: number; releasedBySteamId64: string }) => ReleaseRegularGameplayRepoResult;
	hidePriorityGameplay: (input: { missionId: number; hiddenBySteamId64: string }) => HidePriorityGameplayRepoResult;
	hideRegularGameplay: (input: { missionId: number; hiddenBySteamId64: string }) => HideRegularGameplayRepoResult;
	archiveGame: (input: ArchiveGameRequest & { missionId: number; archivedBySteamId64: string }) => ArchiveGameRepoResult;
	cancelGame: (input: CancelGameRequest & { missionId: number; archivedBySteamId64: string }) => CancelGameRepoResult;
	deleteArchivedMission: (input: DeleteArchivedMissionRequest & { missionId: number }) => DeleteArchivedMissionRepoResult;
	getMissionAuditHistory: (input: { missionId: number }) => GetMissionAuditRepoResult;
	createMissionUpdate: (input: CreateMissionUpdateRequest & { missionId: number; createdBySteamId64: string }) => CreateMissionUpdateRepoResult;
	updateMissionUpdate: (input: CreateMissionUpdateRequest & { missionId: number; updateId: number; updatedBySteamId64: string }) => UpdateMissionUpdateRepoResult;
	updateSlotting: (input: UpdateGameSlottingRequest & { missionId: number; updatedBySteamId64: string }) => UpdateGameSlottingRepoResult;
};

export type GamesCurrentRepo = {
	getCurrentPublishedSummary: () => CurrentGameSummary | null;
	getArchivedGameSummaries: () => GetGameArchiveSummariesRepoResult;
	getGameByShortCode: (input: { shortCode: string; steamId64: string }) => GetGameByShortCodeRepoResult;
};

export type GamesParticipationRepo = {
	claimPrioritySlot: (input: { shortCode: string; slotId: string; steamId64: string; episodeNumber: number }) => ClaimPrioritySlotRepoResult;
	switchPrioritySlot: (input: { shortCode: string; slotId: string; steamId64: string; episodeNumber: number }) => SwitchPrioritySlotRepoResult;
	leavePrioritySlot: (input: { shortCode: string; steamId64: string; episodeNumber: number }) => LeavePrioritySlotRepoResult;
	joinRegularGame: (input: { shortCode: string; steamId64: string }) => JoinRegularGameRepoResult;
	leaveRegularGame: (input: { shortCode: string; steamId64: string }) => LeaveRegularGameRepoResult;
};

export type GetAdminGamesOverviewDeps = {
	repo: GamesAdminOverviewRepo;
};

export type CreateGameDraftDeps = {
	repo: Pick<GamesDraftRepo, 'createDraft'>;
};

export type DeleteCurrentDraftDeps = {
	repo: Pick<GamesDraftRepo, 'deleteCurrentDraft'>;
};

export type UpdateGameSettingsDeps = {
	repo: Pick<GamesDraftRepo, 'updateSettings'>;
};

export type PublishGameDeps = {
	repo: Pick<GamesDraftRepo, 'publishMission'>;
};

export type ReleasePriorityGameplayDeps = {
	repo: Pick<GamesDraftRepo, 'releasePriorityGameplay'>;
};

export type ReleaseRegularGameplayDeps = {
	repo: Pick<GamesDraftRepo, 'releaseRegularGameplay'>;
};

export type HidePriorityGameplayDeps = {
	repo: Pick<GamesDraftRepo, 'hidePriorityGameplay'>;
};

export type HideRegularGameplayDeps = {
	repo: Pick<GamesDraftRepo, 'hideRegularGameplay'>;
};

export type ArchiveGameDeps = {
	repo: Pick<GamesDraftRepo, 'archiveGame'>;
};

export type CancelGameDeps = {
	repo: Pick<GamesDraftRepo, 'cancelGame'>;
};

export type GetMissionAuditDeps = {
	repo: Pick<GamesDraftRepo, 'getMissionAuditHistory'>;
};

export type CreateMissionUpdateDeps = {
	repo: Pick<GamesDraftRepo, 'createMissionUpdate'>;
};

export type UpdateMissionUpdateDeps = {
	repo: Pick<GamesDraftRepo, 'updateMissionUpdate'>;
};

export type GetAdminGameMissionDeps = {
	repo: Pick<GamesDraftRepo, 'getMissionById'>;
};

export type DeleteArchivedMissionDeps = {
	repo: Pick<GamesDraftRepo, 'deleteArchivedMission'>;
};

export type UpdateGameSlottingDeps = {
	repo: Pick<GamesDraftRepo, 'updateSlotting'>;
};

export type GetCurrentGameDeps = {
	repo: Pick<GamesCurrentRepo, 'getCurrentPublishedSummary'>;
};

export type GetGameByShortCodeDeps = {
	repo: Pick<GamesCurrentRepo, 'getGameByShortCode'>;
};

export type GetGameArchiveSummariesDeps = {
	repo: Pick<GamesCurrentRepo, 'getArchivedGameSummaries'>;
};

export type ClaimPrioritySlotDeps = {
	repo: Pick<GamesParticipationRepo, 'claimPrioritySlot'>;
};

export type SwitchPrioritySlotDeps = {
	repo: Pick<GamesParticipationRepo, 'switchPrioritySlot'>;
};

export type LeavePrioritySlotDeps = {
	repo: Pick<GamesParticipationRepo, 'leavePrioritySlot'>;
};

export type JoinRegularGameDeps = {
	repo: Pick<GamesParticipationRepo, 'joinRegularGame'>;
};

export type LeaveRegularGameDeps = {
	repo: Pick<GamesParticipationRepo, 'leaveRegularGame'>;
};

export type UpdateUnitAssignmentsRepoResult =
	| { success: true; mission: GameAdminMission }
	| {
			success: false;
			error: 'not_found' | 'invalid_side_id' | 'invalid_unit' | 'database_error';
	  };

export type ClaimUnitSlotRepoResult =
	| { success: true }
	| {
			success: false;
			error:
				| 'mission_not_found'
				| 'unit_slotting_closed'
				| 'not_unit_leader'
				| 'unit_not_assigned'
				| 'slot_not_found'
				| 'wrong_side'
				| 'slot_taken'
				| 'slots_exhausted'
				| 'claim_conflict'
				| 'database_error';
	  };

export type ReleaseUnitSlotRepoResult =
	| { success: true }
	| {
			success: false;
			error:
				| 'mission_not_found'
				| 'unit_slotting_closed'
				| 'not_unit_leader'
				| 'slot_not_found'
				| 'not_your_unit_slot'
				| 'release_conflict'
				| 'database_error';
	  };

export type GamesUnitAssignmentRepo = {
	updateUnitAssignments: (input: UpdateUnitAssignmentsRequest & { missionId: number; updatedBySteamId64: string }) => UpdateUnitAssignmentsRepoResult;
};

export type GamesUnitSlottingRepo = {
	claimUnitSlot: (input: { shortCode: string; slotId: string; steamId64: string; episodeNumber: number }) => ClaimUnitSlotRepoResult;
	releaseUnitSlot: (input: { shortCode: string; slotId: string; steamId64: string; episodeNumber: number }) => ReleaseUnitSlotRepoResult;
};

export type UpdateUnitAssignmentsDeps = {
	repo: Pick<GamesUnitAssignmentRepo, 'updateUnitAssignments'>;
};

export type ClaimUnitSlotDeps = {
	repo: Pick<GamesUnitSlottingRepo, 'claimUnitSlot'>;
};

export type ReleaseUnitSlotDeps = {
	repo: Pick<GamesUnitSlottingRepo, 'releaseUnitSlot'>;
};

export type ReleaseUnitGameplayRepoResult =
	| { success: true; mission: GameAdminMission }
	| {
			success: false;
			error: 'not_found' | 'not_published' | 'final_password_required' | 'already_released' | 'database_error';
	  };

export type HideUnitGameplayRepoResult =
	| { success: true; mission: GameAdminMission }
	| {
			success: false;
			error: 'not_found' | 'not_published' | 'priority_release_hide_required' | 'already_hidden' | 'database_error';
	  };

export type ReleaseUnitGameplayDeps = {
	repo: { releaseUnitGameplay: (input: { missionId: number; releasedBySteamId64: string }) => ReleaseUnitGameplayRepoResult };
};

export type HideUnitGameplayDeps = {
	repo: { hideUnitGameplay: (input: { missionId: number; hiddenBySteamId64: string }) => HideUnitGameplayRepoResult };
};
