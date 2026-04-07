import type { useTranslations } from 'next-intl';
import type { CanonicalSlot, CanonicalSlotOccupant } from '@/features/games/domain/slotting';
import { sideDisplayName } from '@/features/games/domain/slotting';
import type { GameMissionDetail, GameMissionUpdate } from '@/features/games/domain/types';
import { formatLocalizedDateTime, parseDateTimeValue, type ViewerHourCycle } from '@/platform/dateTime';

export type MissionSide = GameMissionDetail['slotting']['sides'][number];

export type HeldSlotSummary = {
	sideName: string;
	sideColor: string;
	squadName: string;
	rowIndex: number;
	role: string;
};

export type SquadSlotTeam = { team: string; count: number };

export type SlottingSquadRow = {
	squadId: string;
	squadName: string;
	squadSlotTeams: SquadSlotTeam[];
	priorityOpen: number;
	priorityTaken: number;
	regularOpen: number;
	regularTaken: number;
	hasViewerSlot: boolean;
};

export type SlottingSideSummary = {
	sideId: string;
	sideName: string;
	sideColor: string;
	totalSlots: number;
	squadSlotTeams: SquadSlotTeam[];
	prioritySlots: number;
	priorityTaken: number;
	regularSlots: number;
	regularTaken: number;
	hasViewerSlot: boolean;
	squads: SlottingSquadRow[];
};

export const SLOTTING_INDEX_COLUMN_REM = 3.5;
export const SLOTTING_SQUAD_COLUMN_REM = 12;

export function slottingTableWidthRem(squadCount: number): number {
	return SLOTTING_INDEX_COLUMN_REM + squadCount * SLOTTING_SQUAD_COLUMN_REM;
}

export function formatViewerDate(value: string | null, locale: string, timeZone: string | null, hourCycle: ViewerHourCycle | null): string | null {
	return formatLocalizedDateTime(value, {
		locale,
		timeZone,
		hourCycle,
		dateStyle: 'full',
		timeStyle: 'short'
	});
}

export function slotOccupantLabel(occupant: CanonicalSlotOccupant | null, t: ReturnType<typeof useTranslations<'games'>>): string {
	if (!occupant) return t('slotUnclaimed');
	if (occupant.type === 'placeholder') return occupant.label;
	return occupant.callsign;
}

export function slotAccessLabel(access: CanonicalSlot['access'], t: ReturnType<typeof useTranslations<'games'>>): string {
	if (access === 'priority') return t('slotAccessPriority');
	if (access === 'regular') return t('slotAccessRegular');
	return t('slotAccessUnit');
}

export function formatMissionUpdateMessage(update: GameMissionUpdate, t: ReturnType<typeof useTranslations<'games'>>): string {
	const prefix = update.episodeNumber !== null ? `${t('missionUpdateEpisodePrefix', { episodeNumber: update.episodeNumber })} ` : '';

	if (update.kind === 'units_slotting_started') {
		return `${prefix}${t('missionUpdateKindUnitsSlottingStarted')}`;
	}

	if (update.kind === 'priority_slotting_started') {
		return `${prefix}${t('missionUpdateKindPrioritySlottingStarted')}`;
	}

	if (update.kind === 'regular_slotting_started') {
		return `${prefix}${t('missionUpdateKindRegularSlottingStarted')}`;
	}

	if (
		update.episodeNumber !== null &&
		update.totalEpisodes !== null &&
		update.episodeNumber >= update.totalEpisodes
	) {
		return `${prefix}${t('missionUpdateKindGameStartedLastEpisode')}`;
	}

	if (
		update.episodeNumber !== null &&
		update.totalEpisodes !== null &&
		update.episodeNumber < update.totalEpisodes
	) {
		return `${prefix}${t('missionUpdateKindGameStartedWaitNextEpisode', {
			nextEpisodeNumber: update.episodeNumber + 1,
			totalEpisodes: update.totalEpisodes
		})}`;
	}

	return `${prefix}${t('missionUpdateKindGameStartedWaitNextEpisodeGeneric')}`;
}

export function missionStatusLabel(mission: GameMissionDetail, t: ReturnType<typeof useTranslations<'games'>>): string {
	if (mission.status === 'archived') {
		return mission.archiveStatus === 'canceled' ? t('canceledBadge') : t('completedBadge');
	}
	const startsAt = mission.startsAt ? parseDateTimeValue(mission.startsAt) : null;
	return startsAt && startsAt.getTime() <= Date.now() ? t('currentBadge') : t('upcomingBadge');
}

export function getCountdownParts(targetMs: number, nowMs: number) {
	const difference = Math.max(0, targetMs - nowMs);
	return {
		days: Math.floor(difference / 86_400_000),
		hours: Math.floor((difference % 86_400_000) / 3_600_000),
		minutes: Math.floor((difference % 3_600_000) / 60_000),
		seconds: Math.floor((difference % 60_000) / 1_000)
	};
}

export function formatCountdownValue(value: number): string {
	return String(value).padStart(2, '0');
}

export function buildSideRows(side: MissionSide): Array<{ index: number; slots: Array<CanonicalSlot | null> }> {
	const maxSlots = side.squads.reduce((currentMax, squad) => Math.max(currentMax, squad.slots.length), 0);
	return Array.from({ length: maxSlots }, (_, index) => ({
		index,
		slots: side.squads.map((squad) => squad.slots[index] ?? null)
	}));
}

export function findHeldSlotSummary(slotting: GameMissionDetail['slotting'], heldSlotId: string | null): HeldSlotSummary | null {
	if (!heldSlotId) return null;

	for (const side of slotting.sides) {
		for (const squad of side.squads) {
			for (let slotIndex = 0; slotIndex < squad.slots.length; slotIndex += 1) {
				const slot = squad.slots[slotIndex];
				if (slot.id !== heldSlotId) continue;
				return {
					sideName: sideDisplayName(side),
					sideColor: side.color,
					squadName: squad.name,
					rowIndex: slotIndex + 1,
					role: slot.role
				};
			}
		}
	}

	return null;
}

function mergeSquadSlotTeams(a: SquadSlotTeam[], b: SquadSlotTeam[]): SquadSlotTeam[] {
	const map = new Map<string, number>();
	for (const entry of a) map.set(entry.team, (map.get(entry.team) ?? 0) + entry.count);
	for (const entry of b) map.set(entry.team, (map.get(entry.team) ?? 0) + entry.count);
	return Array.from(map, ([team, count]) => ({ team, count }));
}

export function buildSlottingSummary(
	slotting: GameMissionDetail['slotting'],
	heldSlotId: string | null
): SlottingSideSummary[] {
	return slotting.sides.map((side) => {
		let sideTotal = 0;
		let sideSquadSlotTeams: SquadSlotTeam[] = [];
		let sidePrioritySlots = 0;
		let sidePriorityTaken = 0;
		let sideRegularSlots = 0;
		let sideRegularTaken = 0;
		let sideHasViewer = false;

		const squads: SlottingSquadRow[] = side.squads.map((squad) => {
			const teamCounts = new Map<string, number>();
			let priorityOpen = 0;
			let priorityTaken = 0;
			let regularOpen = 0;
			let regularTaken = 0;
			let hasViewerSlot = false;

			for (const slot of squad.slots) {
				if (heldSlotId && slot.id === heldSlotId) {
					hasViewerSlot = true;
					sideHasViewer = true;
				}

				if (slot.access === 'unit') {
					const team = slot.occupant?.type === 'placeholder' ? slot.occupant.label : '?';
					teamCounts.set(team, (teamCounts.get(team) ?? 0) + 1);
				} else if (slot.access === 'priority') {
					if (slot.occupant?.type === 'user') {
						priorityTaken += 1;
					} else {
						priorityOpen += 1;
					}
				} else {
					if (slot.occupant?.type === 'user') {
						regularTaken += 1;
					} else {
						regularOpen += 1;
					}
				}
			}

			const squadSlotTeams = Array.from(teamCounts, ([team, count]) => ({ team, count }));

			sideTotal += squad.slots.length;
			sideSquadSlotTeams = mergeSquadSlotTeams(sideSquadSlotTeams, squadSlotTeams);
			sidePrioritySlots += priorityOpen + priorityTaken;
			sidePriorityTaken += priorityTaken;
			sideRegularSlots += regularOpen + regularTaken;
			sideRegularTaken += regularTaken;

			return {
				squadId: squad.id,
				squadName: squad.name,
				squadSlotTeams,
				priorityOpen,
				priorityTaken,
				regularOpen,
				regularTaken,
				hasViewerSlot
			};
		});

		return {
			sideId: side.id,
			sideName: sideDisplayName(side),
			sideColor: side.color,
			totalSlots: sideTotal,
			squadSlotTeams: sideSquadSlotTeams,
			prioritySlots: sidePrioritySlots,
			priorityTaken: sidePriorityTaken,
			regularSlots: sideRegularSlots,
			regularTaken: sideRegularTaken,
			hasViewerSlot: sideHasViewer,
			squads
		};
	});
}

export function slotCellSurfaceClass(access: CanonicalSlot['access']): string {
	if (access === 'priority') return 'border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10';
	if (access === 'regular') return 'border-neutral-800 bg-white/[0.03]';
	return 'border-neutral-800 bg-black/20';
}

export function slotBadgeClass(access: CanonicalSlot['access']): string {
	if (access === 'priority') return 'border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 text-[color:var(--accent)]';
	if (access === 'regular') return 'border-neutral-700 bg-white/5 text-neutral-300';
	return 'border-neutral-700 bg-black/30 text-neutral-400';
}
