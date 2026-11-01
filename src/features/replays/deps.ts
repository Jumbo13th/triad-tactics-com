import { statsDeps } from '@/features/stats/deps';
import { uploadSnapshot } from '@/features/stats/useCases/uploadSnapshot';
import type { AdminReplaysDeps, PublicReplaysDeps, ReceiverDeps, StatsImporter } from './ports';
import * as repo from './infra/sqliteReplays';
import * as pieces from './infra/diskPieceStore';
import * as objects from './infra/s3ObjectStore';
import { announce } from './infra/discordAnnouncer';

// An admin importing again replaces the episode's draft with the newer file (a Game Master's
// later approval); a published episode is left alone. Filing a reported game only drafts an
// episode that has no statistics yet, so it never overwrites a draft an admin may have edited.
const importStats: StatsImporter = (input) => {
	const result = uploadSnapshot(statsDeps, { ...input, replaceDraft: true });
	return result.success ? { ok: true, gameStatsId: result.gameStatsId } : { ok: false, error: result.error };
};

export const receiverDeps: ReceiverDeps = {
	repo,
	pieces,
	objects,
	now: () => new Date(),
	importStats,
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
