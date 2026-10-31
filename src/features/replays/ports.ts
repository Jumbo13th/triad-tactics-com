import type { ReplayFile, ReplayGameInput, ReplayGameListItem } from './domain/types';

export type ReplayRepo = {
	findFile: (sha256: string) => ReplayFile | null;
	findFiles: (sha256s: string[]) => ReplayFile[];
	/** A file committed twice keeps its first record. */
	insertFile: (file: ReplayFile) => void;
	saveGame: (game: ReplayGameInput) => { created: boolean };
	listGames: (input: { limit: number; offset: number }) => ReplayGameListItem[];
};

/** Pieces of files still being sent, kept until the file is committed or abandoned. */
export type PieceStore = {
	held: (sha256: string) => Promise<number[]>;
	read: (sha256: string, index: number) => Promise<Buffer | null>;
	write: (sha256: string, index: number, bytes: Buffer) => Promise<void>;
	discard: (sha256: string) => Promise<void>;
	discardUntouchedSince: (cutoff: Date) => Promise<void>;
};

export type ObjectStore = {
	isConfigured: () => boolean;
	put: (key: string, body: Buffer, bodySha256: string) => Promise<void>;
};

export type ReceiverDeps = {
	repo: ReplayRepo;
	pieces: PieceStore;
	objects: ObjectStore;
	now: () => Date;
};

export type AdminReplaysDeps = {
	repo: Pick<ReplayRepo, 'listGames'>;
};
