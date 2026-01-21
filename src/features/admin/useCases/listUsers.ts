import type { AdminUserRow } from '@/features/admin/domain/types';
import type { ListUsersDeps } from '../ports';

export type ListUsersResult = {
	users: AdminUserRow[];
	counts: { all: number; renameRequired: number; confirmed: number };
};

function matchesQuery(row: AdminUserRow, q: string) {
	const needle = q.trim().toLowerCase();
	if (!needle) return true;
	const fields = [
		row.steamid64,
		row.current_callsign,
		row.id,
		row.confirmed_application_id
	];
	return fields
		.map((v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : ''))
		.some((h) => h.toLowerCase().includes(needle));
}

export function listUsers(
	deps: ListUsersDeps,
	input: { status: 'all' | 'rename_required' | 'confirmed'; query?: string }
): ListUsersResult {
	const users = deps.repo.listUsers(input.status);
	const filtered = input.query?.trim() ? users.filter((u) => matchesQuery(u, input.query ?? '')) : users;
	return {
		users: filtered,
		counts: {
			all: deps.repo.countUsersByStatus('all'),
			renameRequired: deps.repo.countUsersByStatus('rename_required'),
			confirmed: deps.repo.countUsersByStatus('confirmed')
		}
	};
}
