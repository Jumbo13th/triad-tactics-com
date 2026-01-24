import type { Application } from '@/features/apply/domain/types';
import type { ListApplicationsDeps } from '../ports';

export type ListApplicationsResult = {
	applications: Application[];
	counts: { active: number; archived: number; total: number };
};

function matchesQuery(app: Application, q: string) {
	const needle = q.trim().toLowerCase();
	if (!needle) return true;
	const callsign = app.answers?.callsign ?? '';
	const name = app.answers?.name ?? '';
	const haystacks = [
		app.email ?? '',
		app.steamid64 ?? '',
		app.persona_name ?? '',
		callsign,
		name
	];
	return haystacks.some((h) => h.toLowerCase().includes(needle));
}

export function listApplications(
	deps: ListApplicationsDeps,
	input: { status: 'active' | 'archived' | 'all'; query?: string }
): ListApplicationsResult {
	const applications = deps.repo.getApplicationsByStatus(input.status);
	const filtered = input.query?.trim() ? applications.filter((a) => matchesQuery(a, input.query ?? '')) : applications;
	const counts = {
		active: deps.repo.countApplicationsByStatus('active'),
		archived: deps.repo.countApplicationsByStatus('archived'),
		total: deps.repo.countApplicationsByStatus('all')
	};
	return { applications: filtered, counts };
}
