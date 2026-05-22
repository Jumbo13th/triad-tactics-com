import type { Rotation } from './domain/types';
import type {
	UpdateRotationConfigRequest,
	UpdateRotationSidesRequest,
	UpdateCommanderScheduleRequest,
} from './domain/requests';

export type RotationRepo = {
	getRotation: () => Rotation;
	updateConfig: (input: UpdateRotationConfigRequest & { updatedBySteamid64: string }) =>
		{ success: true; rotation: Rotation } | { success: false; error: 'database_error' };
	updateSides: (input: UpdateRotationSidesRequest & { updatedBySteamid64: string }) =>
		{ success: true; rotation: Rotation } | { success: false; error: 'invalid_unit' | 'duplicate_unit' | 'database_error' };
	updateCommanderSchedule: (input: UpdateCommanderScheduleRequest & { updatedBySteamid64: string }) =>
		{ success: true; rotation: Rotation } | { success: false; error: 'unit_not_on_side' | 'database_error' };
};

export type RotationDeps = {
	repo: RotationRepo;
};
