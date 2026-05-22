import type { ListPublicSanctionsDeps } from '../ports';
import type { PublicSanctionEntry } from '../domain/types';

export type ListPublicSanctionsResult = {
	page: number;
	pageSize: number;
	totalPages: number;
	total: number;
	sanctions: PublicSanctionEntry[];
};

export function listPublicSanctions(
	deps: ListPublicSanctionsDeps,
	input: { page: number; pageSize: number; query?: string; typeFilter?: string | null; status?: string | null }
): ListPublicSanctionsResult {
	const validTypes = ['site_ban', 'server_ban', 'strike'];
	const typeFilter = input.typeFilter && validTypes.includes(input.typeFilter)
		? (input.typeFilter as 'site_ban' | 'server_ban' | 'strike')
		: null;
	const statusFilter = input.status === 'active' ? 'active' as const : null;
	const repoArgs = { pageSize: input.pageSize, query: input.query, typeFilter, statusFilter } as const;
	let { sanctions, total } = deps.repo.listPublicSanctions({ ...repoArgs, page: input.page });
	const totalPages = Math.max(1, Math.ceil(total / input.pageSize));
	const page = Math.min(Math.max(1, input.page), totalPages);
	if (page !== input.page) {
		({ sanctions, total } = deps.repo.listPublicSanctions({ ...repoArgs, page }));
	}
	return { page, pageSize: input.pageSize, totalPages, total, sanctions };
}
