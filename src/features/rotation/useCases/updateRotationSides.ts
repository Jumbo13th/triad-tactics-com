import type { RotationDeps } from '../ports';
import type { UpdateRotationSidesRequest } from '../domain/requests';

export function updateRotationSidesUseCase(
	deps: RotationDeps,
	input: UpdateRotationSidesRequest & { updatedBySteamid64: string }
) {
	const result = deps.repo.updateSides(input);
	if (!result.success) {
		const status = result.error === 'database_error' ? 500 : 400;
		return { status: status as 400 | 500, json: { error: result.error } };
	}
	return { status: 200 as const, json: result.rotation };
}
