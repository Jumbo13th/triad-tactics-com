import type { AdminReplaysDeps, ReceiverDeps } from './ports';
import * as repo from './infra/sqliteReplays';
import * as pieces from './infra/diskPieceStore';
import * as objects from './infra/s3ObjectStore';

export const receiverDeps: ReceiverDeps = {
	repo,
	pieces,
	objects,
	now: () => new Date(),
};

export const adminReplaysDeps: AdminReplaysDeps = {
	repo,
};
