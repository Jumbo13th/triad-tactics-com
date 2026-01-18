import type { ListRenameRequestsDeps } from '../ports';

export function listRenameRequests<TRow>(
	deps: ListRenameRequestsDeps<TRow>,
	input: { status: 'pending' | 'approved' | 'declined' | 'all' }
): { renameRequests: TRow[] } {
	return { renameRequests: deps.repo.listRenameRequests(input.status) };
}
