'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameMissionDetail } from '@/features/games/domain/types';
import { buildSlottingSummary, findHeldSlotSummary } from './missionPageUtils';

export function findUserHeldSlotId(slotting: GameMissionDetail['slotting'], userId: number): string | null {
	for (const side of slotting.sides)
		for (const squad of side.squads)
			for (const slot of squad.slots)
				if (slot.occupant?.type === 'user' && slot.occupant.userId === userId) return slot.id;
	return null;
}

export function findSlotAccess(slotting: GameMissionDetail['slotting'], slotId: string | null) {
	if (!slotId) return null;
	for (const side of slotting.sides)
		for (const squad of side.squads)
			for (const slot of squad.slots)
				if (slot.id === slotId) return slot.access;
	return null;
}

export function countPriorityAvailable(slotting: GameMissionDetail['slotting']): number {
	let count = 0;
	for (const side of slotting.sides)
		for (const squad of side.squads)
			for (const slot of squad.slots)
				if (slot.access === 'priority' && slot.occupant === null) count++;
	return count;
}

export function collectAllEpisodeSides(mission: GameMissionDetail): GameMissionDetail['slotting']['sides'] {
	const seen = new Set<string>();
	const allSides: GameMissionDetail['slotting']['sides'] = [];
	for (const ep of mission.episodeSlottings ?? []) {
		for (const side of ep.slotting.sides) {
			if (!seen.has(side.id)) {
				seen.add(side.id);
				allSides.push(side);
			}
		}
	}
	return allSides.length > 0 ? allSides : mission.slotting.sides;
}

export type EpisodeSlottingState = {
	episodes: GameMissionDetail['episodeSlottings'];
	hasMultipleEpisodes: boolean;
	selectedEpisode: number;
	setSelectedEpisode: (ep: number) => void;
	displayedMission: GameMissionDetail;
	canLeavePrioritySlot: boolean;
	heldSlotSummary: ReturnType<typeof findHeldSlotSummary>;
	slottingSummary: ReturnType<typeof buildSlottingSummary>;
	unclaimedEpisodes: number[];
	unclaimedHintKey: string | null;
	isUnitLeader: boolean;
	isPriorityPlayer: boolean;
	viewerUnitTag: string | null;
	showEpisodeReminder: boolean;
	dismissReminder: (dontShowAgain: boolean) => void;
};

export function useEpisodeSlotting(mission: GameMissionDetail): EpisodeSlottingState {
	const episodes = mission.episodeSlottings ?? [];
	const hasMultipleEpisodes = episodes.length > 1;
	const [selectedEpisode, setSelectedEpisode] = useState(mission.activeEpisode ?? 1);

	// Build displayed mission with per-episode viewer overrides
	const activeEpisodeData = episodes.find((e) => e.episodeNumber === selectedEpisode);
	const episodeHeldSlotId = activeEpisodeData
		? findUserHeldSlotId(activeEpisodeData.slotting, mission.viewer.userId)
		: mission.viewer.heldSlotId;
	const episodeHeldSlotAccess = activeEpisodeData
		? findSlotAccess(activeEpisodeData.slotting, episodeHeldSlotId)
		: mission.viewer.heldSlotAccess;

	const episodeUnitSideId = mission.viewer.unitSideByEpisode?.[selectedEpisode] ?? mission.viewer.unitSideId;

	const displayedMission: GameMissionDetail = activeEpisodeData
		? {
			...mission,
			slotting: activeEpisodeData.slotting,
			slottingRevision: activeEpisodeData.slottingRevision,
			viewer: {
				...mission.viewer,
				heldSlotId: episodeHeldSlotId,
				heldSlotAccess: episodeHeldSlotAccess,
				unitSideId: episodeUnitSideId,
				canClaimPriority: mission.viewer.hasPriorityBadge && mission.priorityClaimOpen && !episodeHeldSlotId,
				canSwitchPriority: mission.priorityClaimOpen && episodeHeldSlotAccess === 'priority',
				canClaimUnitSlot: mission.viewer.isUnitLeader && mission.unitSlottingOpen && episodeUnitSideId != null
			}
		}
		: mission;

	const canLeavePrioritySlot = mission.status === 'published' && displayedMission.viewer.heldSlotAccess === 'priority';
	const heldSlotSummary = findHeldSlotSummary(displayedMission.slotting, displayedMission.viewer.heldSlotId);
	const slottingSummary = buildSlottingSummary(displayedMission.slotting, displayedMission.viewer.heldSlotId);

	// Role checks
	const viewerUserId = mission.viewer.userId;
	const viewerUnitTag = mission.viewer.unitTag;
	const isUnitLeader = mission.viewer.isUnitLeader && mission.unitSlottingOpen;
	const isPriorityPlayer = mission.viewer.hasPriorityBadge && mission.priorityClaimOpen;

	// Per-episode unclaimed detection
	const unitSlotsAllocated = mission.viewer.unitSlotsAllocated;
	const normalizedUnitTag = viewerUnitTag?.toLowerCase() ?? '';

	const unclaimedEpisodes: number[] = [];
	let unclaimedHintKey: string | null = null;

	if (hasMultipleEpisodes && isUnitLeader && viewerUnitTag) {
		for (const ep of episodes) {
			let unitCount = 0;
			for (const side of ep.slotting.sides)
				for (const squad of side.squads)
					for (const slot of squad.slots)
						if (slot.occupant?.type === 'placeholder' && slot.occupant.label.toLowerCase() === normalizedUnitTag)
							unitCount++;
			if (unitCount < unitSlotsAllocated) unclaimedEpisodes.push(ep.episodeNumber);
		}
		if (unclaimedEpisodes.length > 0) unclaimedHintKey = 'episodeUnclaimedUnitHint';
	} else if (hasMultipleEpisodes && isPriorityPlayer && !viewerUnitTag) {
		for (const ep of episodes) {
			let hasSlot = false;
			for (const side of ep.slotting.sides)
				for (const squad of side.squads)
					for (const slot of squad.slots)
						if (slot.occupant?.type === 'user' && slot.occupant.userId === viewerUserId) hasSlot = true;
			if (!hasSlot) unclaimedEpisodes.push(ep.episodeNumber);
		}
		if (unclaimedEpisodes.length > 0) unclaimedHintKey = 'episodeUnclaimedPriorityHint';
	}

	// Episode completion reminder — fires once when the current episode becomes fully claimed
	const reminderDismissKey = `tt_episode_reminder_dismissed_${mission.shortCode}`;
	const prevEpisodeFullRef = useRef(false);
	const [reminderTriggered, setReminderTriggered] = useState(false);
	const currentEpisodeIsFull = !unclaimedEpisodes.includes(selectedEpisode);

	useEffect(() => {
		if (!prevEpisodeFullRef.current && currentEpisodeIsFull && unclaimedEpisodes.length > 0) {
			let dismissed = false;
			try { dismissed = localStorage.getItem(reminderDismissKey) === '1'; } catch { /* ignore */ }
			if (!dismissed) {
				const id = requestAnimationFrame(() => setReminderTriggered(true));
				prevEpisodeFullRef.current = currentEpisodeIsFull;
				return () => cancelAnimationFrame(id);
			}
		}
		prevEpisodeFullRef.current = currentEpisodeIsFull;
	}, [currentEpisodeIsFull, unclaimedEpisodes.length, reminderDismissKey]);

	useEffect(() => {
		prevEpisodeFullRef.current = false;
		const id = requestAnimationFrame(() => setReminderTriggered(false));
		return () => cancelAnimationFrame(id);
	}, [selectedEpisode]);

	const showEpisodeReminder = reminderTriggered && unclaimedEpisodes.length > 0;

	const dismissReminder = (dontShowAgain: boolean) => {
		setReminderTriggered(false);
		if (dontShowAgain) {
			try { localStorage.setItem(reminderDismissKey, '1'); } catch { /* ignore */ }
		}
	};

	return {
		episodes,
		hasMultipleEpisodes,
		selectedEpisode,
		setSelectedEpisode,
		displayedMission,
		canLeavePrioritySlot,
		heldSlotSummary,
		slottingSummary,
		unclaimedEpisodes,
		unclaimedHintKey,
		isUnitLeader,
		isPriorityPlayer,
		viewerUnitTag,
		showEpisodeReminder,
		dismissReminder
	};
}
