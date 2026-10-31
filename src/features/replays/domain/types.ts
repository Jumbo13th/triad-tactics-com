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

export type { ReplayGameListItem } from './adminApi';
