import type { RotationDeps } from '../ports';
import type { UpdateCommanderScheduleRequest } from '../domain/requests';

export function updateCommanderScheduleUseCase(
	deps: RotationDeps,
	input: UpdateCommanderScheduleRequest & { updatedBySteamid64: string }
) {
	const result = deps.repo.updateCommanderSchedule(input);
	if (!result.success) {
		const status = result.error === 'database_error' ? 500 : 400;
		return { status: status as 400 | 500, json: { error: result.error } };
	}
	return { status: 200 as const, json: result.rotation };
}
