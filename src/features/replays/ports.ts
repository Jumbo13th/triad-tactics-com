import type {
	PublicReplayListItem,
	ReplayEpisodeStats,
	ReplayFile,
	ReplayGameInput,
	ReplayGameListItem,
	ReplayGameRecord,
	ReplayMap,
	ReplayMission,
} from './domain/types';

export type ReplayRepo = {
	findFile: (sha256: string) => ReplayFile | null;
	findFiles: (sha256s: string[]) => ReplayFile[];
	/** A file committed twice keeps its first record. */
	insertFile: (file: ReplayFile) => void;
	saveGame: (game: ReplayGameInput) => { created: boolean };
	listGames: (input: { limit: number; offset: number }) => ReplayGameListItem[];
	findGame: (id: number) => ReplayGameRecord | null;
	findGameListItem: (id: number) => ReplayGameListItem | null;
	listMissions: () => ReplayMission[];
	findMission: (id: number) => ReplayMission | null;
	linkGame: (id: number, missionId: number, episodeNumber: number) => void;
	/** null unpublishes. */
	setPublished: (id: number, publishedBySteamid64: string | null) => void;
	markAnnounced: (id: number) => void;
	findEpisodeStats: (missionId: number, episodeNumber: number) => ReplayEpisodeStats | null;
	listPublishedGames: (input: { limit: number; offset: number }) => PublicReplayListItem[];
	findPublishedGame: (id: number) => PublicReplayListItem | null;
	findMap: (world: string) => ReplayMap | null;
	isPublishedSegment: (sha256: string) => boolean;
	findMapFileKind: (sha256: string) => 'relief' | 'topo' | null;
	saveMap: (map: ReplayMap, updatedBySteamid64: string) => void;
};

/** Pieces of files still being sent, kept until the file is committed or abandoned. */
export type PieceStore = {
	held: (sha256: string) => Promise<number[]>;
	read: (sha256: string, index: number) => Promise<Buffer | null>;
	write: (sha256: string, index: number, bytes: Buffer) => Promise<void>;
	discard: (sha256: string) => Promise<void>;
	discardUntouchedSince: (cutoff: Date) => Promise<void>;
};

export type StoredObject = {
	body: ReadableStream<Uint8Array>;
	size: number | null;
};

export type ObjectStore = {
	isConfigured: () => boolean;
	put: (key: string, body: Buffer, bodySha256: string) => Promise<void>;
	/** null when the object does not exist. */
	open: (key: string) => Promise<StoredObject | null>;
	read: (key: string) => Promise<Buffer | null>;
};

export type ReplayAnnouncement = {
	gameId: number;
	missionTitle: string;
	missionShortCode: string | null;
	episodeNumber: number;
	statsId: number | null;
};

/** 'skipped' when no channel is configured, so a later publish can still announce. */
export type ReplayAnnouncer = (announcement: ReplayAnnouncement) => Promise<'sent' | 'skipped'>;

export type StatsImportResult = { ok: true; gameStatsId: number } | { ok: false; error: string };

export type StatsImporter = (input: {
	missionId: number;
	episodeNumber: number;
	snapshotText: string;
	uploadedBySteamid64: string;
}) => StatsImportResult;

export type ReceiverDeps = {
	repo: ReplayRepo;
	pieces: PieceStore;
	objects: ObjectStore;
	now: () => Date;
};

export type AdminReplaysDeps = {
	repo: ReplayRepo;
	objects: Pick<ObjectStore, 'isConfigured' | 'read'>;
	announce: ReplayAnnouncer;
	importStats: StatsImporter;
};

export type PublicReplaysDeps = {
	repo: Pick<
		ReplayRepo,
		| 'listPublishedGames'
		| 'findPublishedGame'
		| 'findGame'
		| 'findGameListItem'
		| 'findFiles'
		| 'findFile'
		| 'findMap'
		| 'isPublishedSegment'
		| 'findMapFileKind'
	>;
	objects: Pick<ObjectStore, 'isConfigured' | 'open'>;
};
