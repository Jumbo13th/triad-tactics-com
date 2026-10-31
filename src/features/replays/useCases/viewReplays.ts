import { mapStorageKey } from '../domain/maps';
import type { PublicReplayGame, PublicReplayListItem } from '../domain/types';
import type { PublicReplaysDeps, StoredObject } from '../ports';

export function listPublishedReplays(
	deps: Pick<PublicReplaysDeps, 'repo'>,
	input: { limit: number; offset: number }
): PublicReplayListItem[] {
	return deps.repo.listPublishedGames(input);
}

// Admins open a game before publishing it, which is how they check what they approve.
export function getReplayForViewer(
	deps: Pick<PublicReplaysDeps, 'repo'>,
	input: { gameId: number; viewerIsAdmin: boolean }
): PublicReplayGame | null {
	const record = deps.repo.findGame(input.gameId);
	if (!record) return null;

	let item = deps.repo.findPublishedGame(input.gameId);
	if (!item) {
		const unpublished = input.viewerIsAdmin ? deps.repo.findGameListItem(input.gameId) : null;
		if (!unpublished) return null;
		item = {
			id: unpublished.id,
			missionTitle: unpublished.missionTitle ?? unpublished.mission ?? unpublished.session,
			missionShortCode: null,
			episodeNumber: unpublished.episodeNumber ?? 1,
			world: unpublished.world,
			startedAt: unpublished.startedAt,
			publishedAt: '',
			statsId: null,
		};
	}

	const files = new Map(deps.repo.findFiles(record.segments).map((f) => [f.sha256, f]));
	const segments = record.segments.map((sha256) => ({ sha256, size: files.get(sha256)?.size ?? 0 }));
	const map = item.world ? deps.repo.findMap(item.world) : null;
	return { ...item, segments, map: { relief: map?.reliefSha256 ?? null, topo: map?.topoSha256 ?? null } };
}

export type OpenedReplayFile = {
	stored: StoredObject;
	contentType: string;
	/** The stored bytes are gzip and are sent as they are. */
	gzip: boolean;
	/** Public files never change, so anything may cache them for good. */
	public: boolean;
};

// Only recording segments and map files are ever served; identity and statistics files
// name player accounts and stay private.
export async function openReplayFile(
	deps: PublicReplaysDeps,
	input: { sha256: string; viewerIsAdmin: () => boolean }
): Promise<OpenedReplayFile | null> {
	if (!deps.objects.isConfigured()) return null;

	const file = deps.repo.findFile(input.sha256);
	if (file) {
		if (file.kind !== 'segment') return null;
		const isPublic = deps.repo.isPublishedSegment(input.sha256);
		if (!isPublic && !input.viewerIsAdmin()) return null;
		const stored = await deps.objects.open(file.storageKey);
		return stored ? { stored, contentType: 'text/plain; charset=utf-8', gzip: true, public: isPublic } : null;
	}

	const mapKind = deps.repo.findMapFileKind(input.sha256);
	if (!mapKind) return null;
	const stored = await deps.objects.open(mapStorageKey(mapKind, input.sha256));
	if (!stored) return null;
	return mapKind === 'relief'
		? { stored, contentType: 'image/webp', gzip: false, public: true }
		: { stored, contentType: 'application/octet-stream', gzip: true, public: true };
}
