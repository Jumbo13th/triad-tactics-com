import { statsDeps } from '@/features/stats/deps';
import { uploadSnapshot } from '@/features/stats/useCases/uploadSnapshot';
import type { AdminReplaysDeps, PublicReplaysDeps, ReceiverDeps, StatsImporter } from './ports';
import * as repo from './infra/sqliteReplays';
import * as pieces from './infra/diskPieceStore';
import * as objects from './infra/s3ObjectStore';
import { announce } from './infra/discordAnnouncer';

// A newer statistics file (a Game Master's later approval) replaces the episode's draft;
// a published episode is left alone.
const importStats: StatsImporter = (input) => {
	const result = uploadSnapshot(statsDeps, { ...input, replaceDraft: true });
	return result.success ? { ok: true, gameStatsId: result.gameStatsId } : { ok: false, error: result.error };
};

export const receiverDeps: ReceiverDeps = {
	repo,
	pieces,
	objects,
	now: () => new Date(),
};

export const adminReplaysDeps: AdminReplaysDeps = {
	repo,
	objects,
	announce,
	importStats,
};

export const publicReplaysDeps: PublicReplaysDeps = {
	repo,
	objects,
};
