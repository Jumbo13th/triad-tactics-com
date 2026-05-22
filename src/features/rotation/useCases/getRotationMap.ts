import type { RotationDeps } from '../ports';
import type { RotationSideInfo } from './getRotationSideForUnit';

export function getRotationMap(
	deps: RotationDeps
): Record<number, RotationSideInfo> {
	const rotation = deps.repo.getRotation();
	const map = new Map<number, RotationSideInfo>();
	for (const u of rotation.sideA) {
		map.set(u.unitId, { sideName: rotation.config.sideAName, sideColor: rotation.config.sideAColor });
	}
	for (const u of rotation.sideB) {
		map.set(u.unitId, { sideName: rotation.config.sideBName, sideColor: rotation.config.sideBColor });
	}
	return Object.fromEntries(map);
}
