import type { ReceiverDeps } from '../ports';

// A host that comes back to a file it stopped sending asks first and starts over from what
// is held, so pieces nobody has touched for a week are only taking up disk.
const ABANDONED_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type PutPieceResult = 'stored' | 'held' | 'conflict';

export async function putPiece(
	deps: Pick<ReceiverDeps, 'repo' | 'pieces' | 'now'>,
	input: { sha256: string; index: number; bytes: Buffer }
): Promise<PutPieceResult> {
	// A stored file never changes, so pieces arriving after its commit add nothing.
	if (deps.repo.findFile(input.sha256)) return 'held';

	const held = await deps.pieces.read(input.sha256, input.index);
	if (held) {
		if (held.equals(input.bytes)) return 'held';
		// The host starts the file over, so nothing held for it can be trusted.
		await deps.pieces.discard(input.sha256);
		return 'conflict';
	}

	// Every file starts with piece 0: a cheap moment to drop abandoned ones.
	if (input.index === 0) {
		await deps.pieces.discardUntouchedSince(new Date(deps.now().getTime() - ABANDONED_AFTER_MS));
	}
	await deps.pieces.write(input.sha256, input.index, input.bytes);
	return 'stored';
}
