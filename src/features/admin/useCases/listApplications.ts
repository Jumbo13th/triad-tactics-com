import type { ListApplicationsDeps } from '../ports';

export type ListApplicationsResult<TApp> = {
	applications: TApp[];
	counts: { active: number; archived: number; total: number };
};

export function listApplications<TApp>(
	deps: ListApplicationsDeps<TApp>,
	input: { status: 'active' | 'archived' | 'all' }
): ListApplicationsResult<TApp> {
	const applications = deps.repo.getApplicationsByStatus(input.status);
	const counts = {
		active: deps.repo.countApplicationsByStatus('active'),
		archived: deps.repo.countApplicationsByStatus('archived'),
		total: deps.repo.countApplicationsByStatus('all')
	};
	return { applications, counts };
}
