import type { ReplayFileKind, ReplayGameEnding } from './protocol';
import type { SegmentHeader } from './segmentHeader';

export type ReplayFile = {
	sha256: string;
	kind: ReplayFileKind;
	serverId: string;
	session: string;
	name: string;
	size: number;
	encodedSize: number;
	encodedSha256: string;
	storageKey: string;
	header: SegmentHeader | null;
};

export type ReplayGameInput = {
	serverId: string;
	session: string;
	over: ReplayGameEnding;
	segments: string[];
	identity: string | null;
	stats: string | null;
};

export type ReplayGameRecord = ReplayGameInput & {
	id: number;
	missionId: number | null;
	episodeNumber: number | null;
	publishedAt: string | null;
	announcedAt: string | null;
};

export type ReplayMission = {
	id: number;
	title: string;
	shortCode: string | null;
	startsAt: string | null;
};

export type ReplayEpisodeStats = {
	id: number;
	status: 'draft' | 'published';
};

export type ReplayMap = {
	world: string;
	reliefSha256: string | null;
	topoSha256: string | null;
};

export type {
	ReplayGameListItem,
	ReplayGameDetail,
	PublicReplayListItem,
	PublicReplayGame,
} from './api';
