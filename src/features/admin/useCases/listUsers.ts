import type { ListUsersDeps } from '../ports';

export type ListUsersResult<TUser> = {
	users: TUser[];
	counts: { all: number; renameRequired: number; confirmed: number };
};

export function listUsers<TUser>(deps: ListUsersDeps<TUser>, input: { status: 'all' | 'rename_required' | 'confirmed' }): ListUsersResult<TUser> {
	return {
		users: deps.repo.listUsers(input.status),
		counts: {
			all: deps.repo.countUsersByStatus('all'),
			renameRequired: deps.repo.countUsersByStatus('rename_required'),
			confirmed: deps.repo.countUsersByStatus('confirmed')
		}
	};
}
