import { inflate, sha256Hex } from '../domain/encoding';
import { storageKeyFor, type FileCommit } from '../domain/protocol';
import { parseSegmentHeader } from '../domain/segmentHeader';
import type { ReceiverDeps } from '../ports';

export type CommitFileResult =
	| { result: 'stored' }
	| { result: 'exists' }
	| { result: 'missing'; missing: number[] }
	| { result: 'mismatch' }
	| { result: 'unstored'; error: unknown };

// A host whose commit request timed out sends it again while the first may still be
// storing the file; commits of one file run one after another, so the second finds the
// first one's outcome.
const commitsInFlight = new Map<string, Promise<void>>();

async function oneAtATime<T>(key: string, run: () => Promise<T>): Promise<T> {
	const previous = commitsInFlight.get(key) ?? Promise.resolve();
	const current = previous.then(run);
	const settled = current.then(
		() => undefined,
		() => undefined
	);
	commitsInFlight.set(key, settled);
	try {
		return await current;
	} finally {
		if (commitsInFlight.get(key) === settled) commitsInFlight.delete(key);
	}
}

export function commitFile(
	deps: ReceiverDeps,
	input: { sha256: string; serverId: string; commit: FileCommit }
): Promise<CommitFileResult> {
	const { sha256, commit } = input;
	return oneAtATime(sha256, async (): Promise<CommitFileResult> => {
		if (deps.repo.findFile(sha256)) return { result: 'exists' };

		const parts: Buffer[] = [];
		const missing: number[] = [];
		for (let index = 0; index < commit.pieces; index++) {
			const piece = await deps.pieces.read(sha256, index);
			if (piece) parts.push(piece);
			else missing.push(index);
		}
		if (missing.length > 0) return { result: 'missing', missing };

		// The identity is checked too: storage is keyed by it, so a wrong one would file
		// the content under a name that promises other bytes.
		const encoded = Buffer.concat(parts);
		const inflated =
			encoded.length === commit.encodedSize && sha256Hex(encoded) === commit.encodedSha256
				? await inflate(encoded, commit.size)
				: null;
		if (!inflated || inflated.size !== commit.size || inflated.sha256 !== sha256) {
			await deps.pieces.discard(sha256);
			return { result: 'mismatch' };
		}

		const storageKey = storageKeyFor(commit.kind, sha256);
		try {
			await deps.objects.put(storageKey, encoded, commit.encodedSha256);
		} catch (error: unknown) {
			return { result: 'unstored', error };
		}

		deps.repo.insertFile({
			sha256,
			kind: commit.kind,
			serverId: input.serverId,
			session: commit.session,
			name: commit.name,
			size: commit.size,
			encodedSize: commit.encodedSize,
			encodedSha256: commit.encodedSha256,
			storageKey,
			header: commit.kind === 'segment' ? parseSegmentHeader(inflated.head) : null,
		});
		await deps.pieces.discard(sha256);
		return { result: 'stored' };
	});
}
