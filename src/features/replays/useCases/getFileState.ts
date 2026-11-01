import type { ReceiverDeps } from '../ports';

export type FileState = { state: 'complete' } | { state: 'partial'; pieces: number[] } | { state: 'unknown' };

export async function getFileState(deps: Pick<ReceiverDeps, 'repo' | 'pieces'>, sha256: string): Promise<FileState> {
	if (deps.repo.findFile(sha256)) return { state: 'complete' };
	const pieces = await deps.pieces.held(sha256);
	return pieces.length > 0 ? { state: 'partial', pieces } : { state: 'unknown' };
}
