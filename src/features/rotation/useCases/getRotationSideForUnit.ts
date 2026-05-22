import type { RotationDeps } from '../ports';

export type RotationSideInfo = { sideName: string; sideColor: string };

export function getRotationSideForUnit(
	deps: RotationDeps,
	unitId: number
): RotationSideInfo | null {
	const rotation = deps.repo.getRotation();
	const allUnits = [...rotation.sideA, ...rotation.sideB];
	const match = allUnits.find((u) => u.unitId === unitId);
	if (!match) return null;
	return {
		sideName: match.side === 'a' ? rotation.config.sideAName : rotation.config.sideBName,
		sideColor: match.side === 'a' ? rotation.config.sideAColor : rotation.config.sideBColor,
	};
}
