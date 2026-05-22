import type { ListSanctionsDeps } from '../ports';
import type { SanctionType, SanctionWithCallsign } from '../domain/types';

export type ListSanctionsResult = {
	page: number;
	pageSize: number;
	totalPages: number;
	total: number;
	sanctions: SanctionWithCallsign[];
	counts: { all: number; site_ban: number; server_ban: number; strike: number };
};

export function listSanctions(
	deps: ListSanctionsDeps,
	input: { typeFilter?: SanctionType | null; query?: string; page: number; pageSize: number }
): ListSanctionsResult {
	const { sanctions, total } = deps.repo.listSanctions({
		page: input.page,
		pageSize: input.pageSize,
		query: input.query,
		typeFilter: input.typeFilter
	});
	const totalPages = Math.max(1, Math.ceil(total / input.pageSize));
	const page = Math.min(Math.max(1, input.page), totalPages);
	return {
		page,
		pageSize: input.pageSize,
		totalPages,
		total,
		sanctions,
		counts: {
			all: deps.repo.countSanctionsByType('all'),
			site_ban: deps.repo.countSanctionsByType('site_ban'),
			server_ban: deps.repo.countSanctionsByType('server_ban'),
			strike: deps.repo.countSanctionsByType('strike')
		}
	};
}
