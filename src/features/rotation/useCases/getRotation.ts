import type { RotationDeps } from '../ports';

export function getRotationUseCase(deps: RotationDeps) {
	return { status: 200 as const, json: deps.repo.getRotation() };
}
