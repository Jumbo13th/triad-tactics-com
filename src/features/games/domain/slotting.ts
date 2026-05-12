import { z } from 'zod';

export const slotAccessSchema = z.enum(['unit', 'priority', 'regular']);

export const slotOccupantSchema = z.union([
	z.null(),
	z.object({
		type: z.literal('placeholder'),
		label: z.string().trim().min(1)
	}),
	z.object({
		type: z.literal('user'),
		userId: z.number().int().positive(),
		callsign: z.string().trim().min(1),
		assignedBy: z.enum(['self', 'admin']),
		assignedAt: z.string()
	})
]);

export const slotSchema = z.object({
	id: z.string().trim().min(1),
	role: z.string().trim().min(1),
	access: slotAccessSchema,
	occupant: slotOccupantSchema
});

export const squadSchema = z.object({
	id: z.string().trim().min(1),
	name: z.string().trim().min(1),
	slots: z.array(slotSchema)
});

export const sideSchema = z.object({
	id: z.string().trim().min(1),
	name: z.string().trim().min(1),
	displayName: z.string().trim().min(1).optional(),
	color: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/),
	squads: z.array(squadSchema)
});

export const canonicalSlottingSchema = z.object({
	sides: z.array(sideSchema)
});

export type CanonicalSlotting = z.infer<typeof canonicalSlottingSchema>;
export type CanonicalSlot = z.infer<typeof slotSchema>;
export type CanonicalSlotOccupant = z.infer<typeof slotOccupantSchema>;

type CanonicalSide = CanonicalSlotting['sides'][number];
type CanonicalSquad = CanonicalSide['squads'][number];

export type SlottingDestructiveChangeReason =
	| 'occupied_slot_removed'
	| 'occupied_slot_access_changed'
	| 'occupied_slot_claimant_replaced';

export type SlottingDestructiveChange = {
	slotId: string;
	sideName: string;
	squadName: string;
	role: string;
	reason: SlottingDestructiveChangeReason;
	occupantUserId: number;
};

export const emptyCanonicalSlotting: CanonicalSlotting = {
	sides: []
};

export function sideDisplayName(side: { name: string; displayName?: string }): string {
	return side.displayName ?? side.name;
}

export function parseCanonicalSlotting(input: unknown): CanonicalSlotting {
	const parsed = typeof input === 'string' ? (JSON.parse(input) as unknown) : input;
	return canonicalSlottingSchema.parse(parsed);
}

export function clearUserOccupants(slotting: CanonicalSlotting): CanonicalSlotting {
	return {
		sides: slotting.sides.map((side) => ({
			...side,
			squads: side.squads.map((squad) => ({
				...squad,
				slots: squad.slots.map((slot) => ({
					...slot,
					occupant: slot.occupant?.type === 'user' ? null : slot.occupant
				}))
			}))
		}))
	};
}

export function hasSlotAccess(slotting: CanonicalSlotting, access: z.infer<typeof slotAccessSchema>): boolean {
	return slotting.sides.some((side) =>
		side.squads.some((squad) => squad.slots.some((slot) => slot.access === access))
	);
}

export function hasPrioritySlots(slotting: CanonicalSlotting): boolean {
	return hasSlotAccess(slotting, 'priority');
}

function findCanonicalSlotContext(slotting: CanonicalSlotting, slotId: string): {
	side: CanonicalSide;
	squad: CanonicalSquad;
	slot: CanonicalSlot;
} | null {
	for (const side of slotting.sides) {
		for (const squad of side.squads) {
			for (const slot of squad.slots) {
				if (slot.id === slotId) {
					return { side, squad, slot };
				}
			}
		}
	}

	return null;
}

export function detectDestructiveSlottingChanges(
	current: CanonicalSlotting,
	next: CanonicalSlotting
): SlottingDestructiveChange[] {
	const nextSlotIds = new Set<string>();
	for (const side of next.sides) {
		for (const squad of side.squads) {
			for (const slot of squad.slots) {
				nextSlotIds.add(slot.id);
			}
		}
	}

	const changes: SlottingDestructiveChange[] = [];

	for (const side of current.sides) {
		for (const squad of side.squads) {
			for (const slot of squad.slots) {
				if (slot.occupant?.type !== 'user') continue;

				if (!nextSlotIds.has(slot.id)) {
					changes.push({
						slotId: slot.id,
						sideName: sideDisplayName(side),
						squadName: squad.name,
						role: slot.role,
						reason: 'occupied_slot_removed',
						occupantUserId: slot.occupant.userId
					});
					continue;
				}

				const nextContext = findCanonicalSlotContext(next, slot.id);
				if (!nextContext) continue;

				if (nextContext.slot.access !== slot.access) {
					changes.push({
						slotId: slot.id,
						sideName: sideDisplayName(side),
						squadName: squad.name,
						role: slot.role,
						reason: 'occupied_slot_access_changed',
						occupantUserId: slot.occupant.userId
					});
					continue;
				}

				if (nextContext.slot.occupant?.type !== 'user' || nextContext.slot.occupant.userId !== slot.occupant.userId) {
					changes.push({
						slotId: slot.id,
						sideName: sideDisplayName(side),
						squadName: squad.name,
						role: slot.role,
						reason: 'occupied_slot_claimant_replaced',
						occupantUserId: slot.occupant.userId
					});
				}
			}
		}
	}

	return changes;
}

/**
 * Reconcile slot access types based on unit allocations.
 *
 * Target: exactly `pool = totalSlots - totalUnitAllocated` slots should be priority/regular.
 * The rest should be unit access.
 *
 * Rules:
 * - Never touch slots with occupants (claimed unit slots stay unit, claimed priority stays priority)
 * - If too few priority/regular slots: convert unclaimed unit slots (top slots first — Squad Leaders get priority)
 * - If too many priority/regular slots: convert unclaimed priority/regular back to unit (bottom slots first)
 * - Split priority:regular 2:1 among the converted slots
 *
 * Returns a new slotting object (does not mutate the input).
 * Returns null if no changes were needed.
 */
export function autoConvertUnclaimedSlots(
	slotting: CanonicalSlotting,
	totalUnitAllocated: number
): CanonicalSlotting | null {
	const result = structuredClone(slotting);

	let totalSlots = 0;
	for (const side of result.sides) {
		for (const squad of side.squads) {
			totalSlots += squad.slots.length;
		}
	}

	const targetNonUnit = Math.max(0, totalSlots - totalUnitAllocated);

	// Count current non-unit slots that have no occupant (can be reshuffled)
	// and those with occupants (locked in place)
	let currentNonUnitUnoccupied = 0;
	let currentNonUnitOccupied = 0;
	for (const side of result.sides) {
		for (const squad of side.squads) {
			for (const slot of squad.slots) {
				if (slot.access !== 'unit') {
					if (slot.occupant === null) currentNonUnitUnoccupied++;
					else currentNonUnitOccupied++;
				}
			}
		}
	}

	const currentNonUnit = currentNonUnitUnoccupied + currentNonUnitOccupied;
	if (currentNonUnit === targetNonUnit) return null;

	type SlotRef = { slot: CanonicalSlot; squadIndex: number; slotIndex: number };

	if (currentNonUnit < targetNonUnit) {
		// Need more non-unit slots → convert unclaimed unit slots
		const needed = targetNonUnit - currentNonUnit;
		const unclaimed: SlotRef[] = [];
		for (const side of result.sides) {
			for (let si = 0; si < side.squads.length; si++) {
				for (let sli = 0; sli < side.squads[si].slots.length; sli++) {
					const slot = side.squads[si].slots[sli];
					if (slot.access === 'unit' && slot.occupant === null) {
						unclaimed.push({ slot, squadIndex: si, slotIndex: sli });
					}
				}
			}
		}
		// Top slots first (lower index = higher rank)
		unclaimed.sort((a, b) => a.slotIndex - b.slotIndex || a.squadIndex - b.squadIndex);
		const toConvert = unclaimed.slice(0, needed);
		const priorityCount = Math.round(toConvert.length * 2 / 3);
		for (let i = 0; i < toConvert.length; i++) {
			toConvert[i].slot.access = i < priorityCount ? 'priority' : 'regular';
		}
	} else {
		// Too many non-unit slots → convert unoccupied priority/regular back to unit
		const excess = currentNonUnit - targetNonUnit;
		const convertible: SlotRef[] = [];
		for (const side of result.sides) {
			for (let si = 0; si < side.squads.length; si++) {
				for (let sli = 0; sli < side.squads[si].slots.length; sli++) {
					const slot = side.squads[si].slots[sli];
					if (slot.access !== 'unit' && slot.occupant === null) {
						convertible.push({ slot, squadIndex: si, slotIndex: sli });
					}
				}
			}
		}
		// Bottom slots first (higher index = lower rank — give those back to units)
		convertible.sort((a, b) => b.slotIndex - a.slotIndex || b.squadIndex - a.squadIndex);
		const toRevert = convertible.slice(0, excess);
		for (const ref of toRevert) {
			ref.slot.access = 'unit';
		}
	}

	return result;
}

export function countUnitSlotsUsed(slotting: CanonicalSlotting, unitTag: string): number {
	const normalizedTag = unitTag.toLowerCase();
	let count = 0;
	for (const side of slotting.sides) {
		for (const squad of side.squads) {
			for (const slot of squad.slots) {
				if (
					slot.occupant?.type === 'placeholder' &&
					slot.occupant.label.toLowerCase() === normalizedTag
				) {
					count++;
				}
			}
		}
	}
	return count;
}
