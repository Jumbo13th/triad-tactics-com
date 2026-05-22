export type RotationSide = 'a' | 'b';

export type RotationConfig = {
	sideAName: string;
	sideBName: string;
	sideAColor: string;
	sideBColor: string;
	updatedAt: string | null;
};

export type RotationUnitEntry = {
	unitId: number;
	unitTag: string;
	unitName: string;
	slotsAllocated: number;
	leaderCallsign: string | null;
	side: RotationSide;
	position: number;
};

export type RotationCommanderPair = {
	id: number;
	position: number;
	sideAUnitId: number;
	sideAUnitTag: string;
	sideAUnitName: string;
	sideALeaderCallsign: string | null;
	sideBUnitId: number;
	sideBUnitTag: string;
	sideBUnitName: string;
	sideBLeaderCallsign: string | null;
	scheduledDate: string;
};

export type AvailableUnit = {
	unitId: number;
	unitTag: string;
	unitName: string;
	slotsAllocated: number;
	leaderCallsign: string | null;
};

export type Rotation = {
	config: RotationConfig;
	sideA: RotationUnitEntry[];
	sideB: RotationUnitEntry[];
	commanderSchedule: RotationCommanderPair[];
	availableUnits: AvailableUnit[];
};
