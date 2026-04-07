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

type LegacySlotSource = {
	role: string;
	access: z.infer<typeof slotAccessSchema>;
	placeholderLabel: string | null;
};

type LegacySquadSource = {
	name: string;
	slots: LegacySlotSource[];
};

type LegacySideSource = {
	name: string;
	displayName: string | undefined;
	color: string;
	squads: LegacySquadSource[];
};

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

const legacyDefaultColors = ['#3B82F6', '#EF4444', '#22C55E', '#F59E0B', '#8B5CF6', '#14B8A6'];

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

export function hasRegularSlots(slotting: CanonicalSlotting): boolean {
	return hasSlotAccess(slotting, 'regular');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredString(value: unknown, fieldName: string): string {
	if (typeof value !== 'string') {
		throw new Error(`${fieldName}_invalid`);
	}
	const trimmed = value.trim();
	if (!trimmed) {
		throw new Error(`${fieldName}_invalid`);
	}
	return trimmed;
}

function slugifySegment(value: string, fallback: string): string {
	const normalized = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return normalized || fallback;
}

function normalizeNaturalKey(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeLegacyColor(value: unknown, sideIndex: number): string {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed;
	}
	return legacyDefaultColors[sideIndex % legacyDefaultColors.length];
}

function parseLegacyAccess(value: unknown): z.infer<typeof slotAccessSchema> {
	if (typeof value !== 'string') return 'regular';
	const normalized = value.trim().toLowerCase();
	if (normalized === 'unit' || normalized === 'squad' || normalized === 'reserved') return 'unit';
	if (normalized === 'priority' || normalized === 'badge') return 'priority';
	if (normalized === 'regular' || normalized === 'open') return 'regular';
	throw new Error('legacy_slot_access_invalid');
}

function parseLegacySlot(value: unknown): LegacySlotSource {
	if (typeof value === 'string') {
		return {
			role: readRequiredString(value, 'legacy_slot_role'),
			access: 'regular',
			placeholderLabel: null
		};
	}

	if (!isRecord(value)) {
		throw new Error('legacy_slot_invalid');
	}

	const roleSource = value.role ?? value.name ?? value.label;
	const role = readRequiredString(roleSource, 'legacy_slot_role');
	const access = parseLegacyAccess(value.access ?? value.type ?? value.kind);
	const placeholderSource =
		value.placeholder ?? value.placeholderLabel ?? value.squad ?? value.squadLabel ?? value.occupantLabel;

	return {
		role,
		access,
		placeholderLabel:
			access === 'unit'
				? typeof placeholderSource === 'string' && placeholderSource.trim()
					? placeholderSource.trim()
					: role
				: null
	};
}

function parseLegacySource(input: unknown): LegacySideSource[] {
	const parsed = typeof input === 'string' ? (JSON.parse(input) as unknown) : input;
	const sidesSource = Array.isArray(parsed)
		? parsed
		: isRecord(parsed) && Array.isArray(parsed.sides)
			? parsed.sides
			: null;

	if (!sidesSource) {
		throw new Error('legacy_slotting_invalid');
	}

	return sidesSource.map((sideValue, sideIndex) => {
		if (!isRecord(sideValue)) {
			throw new Error('legacy_side_invalid');
		}

		const squadsSource = sideValue.squads;
		if (!Array.isArray(squadsSource)) {
			throw new Error('legacy_side_squads_invalid');
		}

		return {
			name: readRequiredString(sideValue.name, 'legacy_side_name'),
			displayName: typeof sideValue.displayName === 'string' && sideValue.displayName.trim() ? sideValue.displayName.trim() : undefined,
			color: normalizeLegacyColor(sideValue.color, sideIndex),
			squads: squadsSource.map((squadValue) => {
				if (!isRecord(squadValue) || !Array.isArray(squadValue.slots)) {
					throw new Error('legacy_squad_invalid');
				}

				return {
					name: readRequiredString(squadValue.name, 'legacy_squad_name'),
					slots: squadValue.slots.map((slotValue) => parseLegacySlot(slotValue))
				};
			})
		};
	});
}

function buildSlotNaturalKey(sideName: string, squadName: string, role: string, ordinal: number): string {
	return [normalizeNaturalKey(sideName), normalizeNaturalKey(squadName), normalizeNaturalKey(role), String(ordinal)].join('|');
}

function buildCanonicalSlotMap(slotting: CanonicalSlotting): Map<string, CanonicalSlot> {
	const slotMap = new Map<string, CanonicalSlot>();

	for (const side of slotting.sides) {
		for (const squad of side.squads) {
			const roleCounts = new Map<string, number>();
			for (const slot of squad.slots) {
				const roleKey = normalizeNaturalKey(slot.role);
				const ordinal = (roleCounts.get(roleKey) ?? 0) + 1;
				roleCounts.set(roleKey, ordinal);
				slotMap.set(buildSlotNaturalKey(side.name, squad.name, slot.role, ordinal), slot);
			}
		}
	}

	return slotMap;
}

export function normalizeLegacySlotting(
	input: unknown,
	options?: { existing?: CanonicalSlotting }
): CanonicalSlotting {
	const legacySides = parseLegacySource(input);
	const existingSlotMap = options?.existing ? buildCanonicalSlotMap(options.existing) : new Map<string, CanonicalSlot>();

	return {
		sides: legacySides.map((side, sideIndex) => ({
			id:
				options?.existing?.sides.find((existingSide) => normalizeNaturalKey(existingSide.name) === normalizeNaturalKey(side.name))?.id ??
				`side-${sideIndex + 1}-${slugifySegment(side.name, 'side')}`,
			name: side.name,
			...(side.displayName ? { displayName: side.displayName } : {}),
			color: side.color,
			squads: side.squads.map((squad, squadIndex) => ({
				id:
					options?.existing?.sides
						.find((existingSide) => normalizeNaturalKey(existingSide.name) === normalizeNaturalKey(side.name))
						?.squads.find((existingSquad) => normalizeNaturalKey(existingSquad.name) === normalizeNaturalKey(squad.name))?.id ??
					`side-${sideIndex + 1}-squad-${squadIndex + 1}-${slugifySegment(squad.name, 'squad')}`,
				name: squad.name,
				slots: squad.slots.map((slot, slotIndex) => {
					const roleOrdinal =
						squad.slots.slice(0, slotIndex + 1).filter((candidate) => normalizeNaturalKey(candidate.role) === normalizeNaturalKey(slot.role)).length;
					const matched = existingSlotMap.get(buildSlotNaturalKey(side.name, squad.name, slot.role, roleOrdinal));
					const preservedOccupant =
						slot.access === 'priority' && matched?.occupant?.type === 'user' && matched.access === 'priority'
							? matched.occupant
							: null;

					return {
						id:
							matched?.id ??
							`side-${sideIndex + 1}-squad-${squadIndex + 1}-slot-${slotIndex + 1}-${slugifySegment(slot.role, 'slot')}`,
						role: slot.role,
						access: slot.access,
						occupant:
							slot.access === 'unit'
								? { type: 'placeholder' as const, label: slot.placeholderLabel ?? slot.role }
								: preservedOccupant
					};
				})
			}))
		}))
	};
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
