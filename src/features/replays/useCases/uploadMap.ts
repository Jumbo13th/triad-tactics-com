import { inflate, sha256Hex } from '../domain/encoding';
import { mapStorageKey, type MapFileKind } from '../domain/maps';
import type { ReceiverDeps, ReplayRepo } from '../ports';

export type MapCommit = {
	kind: MapFileKind;
	sha256: string;
	size: number;
	encodedSize: number;
	encodedSha256: string;
	pieces: number;
};

export type CommitMapResult = { result: 'stored' } | { result: 'missing'; missing: number[] } | { result: 'mismatch' } | { result: 'unstored'; error: unknown };

const WEBP = (b: Buffer) => b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP';
const PNG = (b: Buffer) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

// The admin page sends the relief as the WebP (or PNG) it made from the exported TGA and the
// geometry gzipped, both in pieces under the proxy's body limit; each is checked for what it
// claims to be before it is stored.
export async function commitMapFile(deps: Pick<ReceiverDeps, 'pieces' | 'objects'>, commit: MapCommit): Promise<CommitMapResult> {
	const parts: Buffer[] = [];
	const missing: number[] = [];
	for (let index = 0; index < commit.pieces; index++) {
		const piece = await deps.pieces.read(commit.sha256, index);
		if (piece) parts.push(piece);
		else missing.push(index);
	}
	if (missing.length > 0) return { result: 'missing', missing };

	const encoded = Buffer.concat(parts);
	let valid = encoded.length === commit.encodedSize && sha256Hex(encoded) === commit.encodedSha256;
	if (valid && commit.kind === 'relief') {
		valid = commit.sha256 === commit.encodedSha256 && (WEBP(encoded) || PNG(encoded));
	} else if (valid) {
		const inflated = await inflate(encoded, commit.size);
		valid = inflated !== null && inflated.size === commit.size && inflated.sha256 === commit.sha256 && inflated.head.startsWith('TOPO');
	}
	if (!valid) {
		await deps.pieces.discard(commit.sha256);
		return { result: 'mismatch' };
	}

	try {
		await deps.objects.put(mapStorageKey(commit.kind, commit.sha256), encoded, commit.encodedSha256);
	} catch (error: unknown) {
		return { result: 'unstored', error };
	}
	await deps.pieces.discard(commit.sha256);
	return { result: 'stored' };
}

/** Several mission worlds on one terrain point at the same stored files. */
export function setReplayMap(
	deps: { repo: Pick<ReplayRepo, 'findMap' | 'saveMap'> },
	input: { world: string; relief: string | null; topo: string | null; updatedBySteamid64: string }
): void {
	const current = deps.repo.findMap(input.world);
	deps.repo.saveMap(
		{
			world: input.world,
			reliefSha256: input.relief ?? current?.reliefSha256 ?? null,
			topoSha256: input.topo ?? current?.topoSha256 ?? null,
		},
		input.updatedBySteamid64
	);
}
