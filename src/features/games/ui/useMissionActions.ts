'use client';

import { useRef, useState, useTransition } from 'react';
import type { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';

function mapActionError(code: string | null | undefined, actionId: string, t: ReturnType<typeof useTranslations<'games'>>): string {
	switch (code) {
		case 'claim_closed':
			return t('actionClaimClosed');
		case 'slot_taken':
			return t('actionSlotTaken');
		case 'claim_conflict':
			return t('actionClaimConflict');
		case 'already_has_slot':
			return t('actionAlreadyHasSlot');
		case 'badge_required':
			return t('actionBadgeRequired');
		case 'join_closed':
			return t('actionJoinClosed');
		case 'priority_slot_available':
			return t('actionPrioritySlotAvailable');
		case 'no_current_slot':
			return actionId === 'leave-slot' ? t('actionNoHeldPrioritySlot') : t('actionNoCurrentSlot');
		case 'already_in_slot':
			return t('actionAlreadyInSlot');
		case 'switch_conflict':
			return t('actionSwitchConflict');
		case 'leave_conflict':
			return t('actionLeaveConflict');
		case 'slot_not_found':
			return t('actionSlotNotFound');
		case 'mission_not_found':
			return t('actionMissionNotFound');
		case 'slots_exhausted':
			return t('actionSlotsExhausted');
		case 'unit_slotting_closed':
			return t('actionUnitSlottingClosed');
		case 'not_unit_leader':
			return t('actionNotUnitLeader');
		case 'unit_not_assigned':
			return t('actionUnitNotAssigned');
		case 'wrong_side':
			return t('actionWrongSide');
		case 'not_your_unit_slot':
			return t('actionNotYourUnitSlot');
		case 'release_conflict':
			return t('actionReleaseConflict');
		default:
			return t('actionGenericError');
	}
}

export function useMissionActions(t: ReturnType<typeof useTranslations<'games'>>) {
	const router = useRouter();
	const [actionError, setActionError] = useState<string | null>(null);
	const [pendingActionId, setPendingActionId] = useState<string | null>(null);
	const [isRefreshing, startTransition] = useTransition();
	const lockRef = useRef<string | null>(null);

	const busy = pendingActionId !== null || isRefreshing;

	const runAction = async (input: {
		id: string;
		path: string;
		body?: Record<string, unknown>;
	}): Promise<boolean> => {
		if (lockRef.current !== null) return false;
		lockRef.current = input.id;
		setActionError(null);
		setPendingActionId(input.id);

		try {
			const response = await fetch(input.path, {
				method: 'POST',
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json'
				},
				body: input.body ? JSON.stringify(input.body) : undefined
			});

			const payload = (await response.json().catch(() => null)) as { error?: string } | null;
			if (!response.ok) {
				if (lockRef.current === input.id) {
					setActionError(mapActionError(payload?.error, input.id, t));
				}
				return false;
			}

			startTransition(() => {
				router.refresh();
			});
			return true;
		} catch {
			if (lockRef.current === input.id) {
				setActionError(t('actionGenericError'));
			}
			return false;
		} finally {
			lockRef.current = null;
			setPendingActionId(null);
		}
	};

	return { actionError, clearActionError: () => setActionError(null), pendingActionId, busy, runAction };
}
