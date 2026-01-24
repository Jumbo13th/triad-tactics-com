import type { AdminRenameRequestRow } from '@/features/admin/domain/types';
import type { ListRenameRequestsDeps } from '../ports';

export function listRenameRequests(
	deps: ListRenameRequestsDeps,
	input: { status: 'pending' | 'approved' | 'declined' | 'all'; query?: string }
): { renameRequests: AdminRenameRequestRow[] } {
	const rows = deps.repo.listRenameRequests(input.status);
	const needle = input.query?.trim().toLowerCase() ?? '';
	if (!needle) return { renameRequests: rows };
	const filtered = rows.filter((row) => {
		const fields = [
			row.steamid64,
			row.old_callsign,
			row.new_callsign,
			row.status,
			row.id,
			row.user_id
		];
		return fields
			.map((v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : ''))
			.some((h) => h.toLowerCase().includes(needle));
	});
	return { renameRequests: filtered };
}
