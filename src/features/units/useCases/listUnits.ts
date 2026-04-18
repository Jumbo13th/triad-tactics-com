import type { UnitDeps } from '../ports';
import type { UnitStatus, UnitSummary } from '../domain/types';

export type ListUnitsResult = {
	ok: true;
	status: 200;
	json: { units: UnitSummary[]; total: number; page: number; pageSize: number };
};

export function listUnits(deps: UnitDeps, input: {
	status?: UnitStatus;
	query?: string;
	hasSlots?: boolean;
	page?: number;
	pageSize?: number;
}): ListUnitsResult {
	const page = input.page ?? 1;
	const pageSize = input.pageSize ?? 50;
	const units = deps.repo.listUnits({ status: input.status, query: input.query, hasSlots: input.hasSlots, page, pageSize });
	const total = deps.repo.countUnits({ status: input.status, query: input.query, hasSlots: input.hasSlots });
	return { ok: true, status: 200, json: { units, total, page, pageSize } };
}
