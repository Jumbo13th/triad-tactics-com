import { parseSnapshot } from '../domain/snapshot';
import type { StatsDeps } from '../ports';
import { buildAutoMapping, buildGameStatsAdminView, type GameStatsAdminView } from './adminView';

export type UploadSnapshotResult =
	| { success: true; gameStatsId: number; view: GameStatsAdminView }
	| {
			success: false;
			error:
				| 'invalid_json'
				| 'invalid_snapshot'
				| 'mission_not_found'
				| 'duplicate_snapshot'
				| 'episode_already_published'
				| 'episode_has_draft';
			existingGameStatsId?: number;
	  };

/** Manual sync entry point: the GUID→unit automap is resolved NOW and frozen with the record. */
export function uploadSnapshot(
	deps: StatsDeps,
	input: { missionId: number; episodeNumber: number; snapshotText: string; replaceDraft: boolean; uploadedBySteamid64: string }
): UploadSnapshotResult {
	const parsed = parseSnapshot(input.snapshotText);
	if (!parsed.success) return { success: false, error: parsed.error };

	if (deps.repo.missionTitle(input.missionId) === null) {
		return { success: false, error: 'mission_not_found' };
	}

	const existingEpisode = deps.repo.findByMissionEpisode(input.missionId, input.episodeNumber);
	if (existingEpisode && existingEpisode.status === 'published') {
		return { success: false, error: 'episode_already_published', existingGameStatsId: existingEpisode.id };
	}

	const duplicate = deps.repo.findByHash(parsed.hash);
	if (duplicate && duplicate.id !== existingEpisode?.id) {
		return { success: false, error: 'duplicate_snapshot', existingGameStatsId: duplicate.id };
	}

	const mapping = buildAutoMapping(deps, parsed.snapshot);

	const record = {
		snapshotJson: parsed.raw,
		snapshotHash: parsed.hash,
		configJson: JSON.stringify(parsed.snapshot.config),
		mappingJson: JSON.stringify(mapping),
		winnerSide: mapping.winner,
		missionName: parsed.snapshot.missionName,
		playedAt: parsed.snapshot.startedAt,
		uploadedBySteamid64: input.uploadedBySteamid64,
	};

	let gameStatsId: number;
	if (existingEpisode) {
		if (!input.replaceDraft) {
			return { success: false, error: 'episode_has_draft', existingGameStatsId: existingEpisode.id };
		}
		deps.repo.replaceDraft(existingEpisode.id, record);
		gameStatsId = existingEpisode.id;
	} else {
		gameStatsId = deps.repo.insertDraft({ missionId: input.missionId, episodeNumber: input.episodeNumber, ...record });
	}

	const view = buildGameStatsAdminView(deps, gameStatsId);
	if (!view) return { success: false, error: 'invalid_snapshot' };

	return { success: true, gameStatsId, view };
}
