import type { RotationDeps } from './ports';
import {
	getRotation,
	updateConfig,
	updateSides,
	updateCommanderSchedule,
} from './infra/sqliteRotation';

export const rotationDeps: RotationDeps = {
	repo: {
		getRotation,
		updateConfig,
		updateSides,
		updateCommanderSchedule,
	},
};
