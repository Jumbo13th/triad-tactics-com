import type { ListApplicationsDeps } from '../ports';

export type ListApplicationsResult<TApp> = {
	applications: TApp[];
};

export function listApplications<TApp>(deps: ListApplicationsDeps<TApp>): ListApplicationsResult<TApp> {
	const applications = deps.repo.getAllApplications();
	return { applications };
}
