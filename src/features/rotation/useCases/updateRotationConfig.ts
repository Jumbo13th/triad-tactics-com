import type { RotationDeps } from '../ports';
import type { UpdateRotationConfigRequest } from '../domain/requests';

export function updateRotationConfigUseCase(
	deps: RotationDeps,
	input: UpdateRotationConfigRequest & { updatedBySteamid64: string }
) {
	const result = deps.repo.updateConfig(input);
	if (!result.success) {
		return { status: 500 as const, json: { error: result.error } };
	}
	return { status: 200 as const, json: result.rotation };
}
