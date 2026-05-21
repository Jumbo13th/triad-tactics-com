import { describe, expect, it } from 'vitest';

describe('autoConvertUnclaimedSlots (per-side)', () => {
	async function importSlotting() {
		return await import('@/features/games/domain/slotting');
	}

	function twoSideSlotting(sideASlots: number, sideBSlots: number) {
		const makeSlots = (sideId: string, count: number) =>
			Array.from({ length: count }, (_, i) => ({
				id: `${sideId}-slot-${i + 1}`,
				role: `Role ${i + 1}`,
				access: 'unit' as const,
				occupant: null
			}));

		return {
			sides: [
				{
					id: 'side-a', name: 'Side A', color: '#3B82F6',
					squads: [{ id: 'side-a-squad-1', name: 'Alpha', slots: makeSlots('side-a', sideASlots) }]
				},
				{
					id: 'side-b', name: 'Side B', color: '#EF4444',
					squads: [{ id: 'side-b-squad-1', name: 'Bravo', slots: makeSlots('side-b', sideBSlots) }]
				}
			]
		};
	}

	function countByAccess(slotting: { sides: Array<{ id: string; squads: Array<{ slots: Array<{ access: string }> }> }> }, sideId: string) {
		const side = slotting.sides.find((s) => s.id === sideId);
		if (!side) return { unit: 0, priority: 0, regular: 0 };
		let unit = 0, priority = 0, regular = 0;
		for (const squad of side.squads)
			for (const slot of squad.slots) {
				if (slot.access === 'unit') unit++;
				else if (slot.access === 'priority') priority++;
				else if (slot.access === 'regular') regular++;
			}
		return { unit, priority, regular };
	}

	it('converts each side independently based on per-side allocation', async () => {
		const { autoConvertUnclaimedSlots } = await importSlotting();

		// Side A: 10 slots, 6 allocated → 4 should convert
		// Side B: 8 slots, 8 allocated → 0 should convert (all stay unit)
		const slotting = twoSideSlotting(10, 8);
		const result = autoConvertUnclaimedSlots(slotting, new Map([['side-a', 6], ['side-b', 8]]));

		expect(result).not.toBeNull();
		const sideA = countByAccess(result!, 'side-a');
		const sideB = countByAccess(result!, 'side-b');

		expect(sideA.unit).toBe(6);
		expect(sideA.priority + sideA.regular).toBe(4);
		expect(sideB.unit).toBe(8);
		expect(sideB.priority + sideB.regular).toBe(0);
	});

	it('converts all slots to priority/regular when side has no allocation', async () => {
		const { autoConvertUnclaimedSlots } = await importSlotting();

		// Side A: 5 slots, 5 allocated → stays unit
		// Side B: 4 slots, 0 allocated → all convert
		const slotting = twoSideSlotting(5, 4);
		const result = autoConvertUnclaimedSlots(slotting, new Map([['side-a', 5]]));

		expect(result).not.toBeNull();
		const sideA = countByAccess(result!, 'side-a');
		const sideB = countByAccess(result!, 'side-b');

		expect(sideA.unit).toBe(5);
		expect(sideA.priority + sideA.regular).toBe(0);
		expect(sideB.unit).toBe(0);
		expect(sideB.priority + sideB.regular).toBe(4);
	});

	it('returns null when no changes needed on any side', async () => {
		const { autoConvertUnclaimedSlots } = await importSlotting();

		// Both sides fully allocated → no changes
		const slotting = twoSideSlotting(3, 4);
		const result = autoConvertUnclaimedSlots(slotting, new Map([['side-a', 3], ['side-b', 4]]));

		expect(result).toBeNull();
	});

	it('reverts excess non-unit slots back to unit per side', async () => {
		const { autoConvertUnclaimedSlots } = await importSlotting();

		// Side A has 5 slots: 2 unit + 3 priority. Allocating 4 → need to revert 2 priority to unit.
		const slotting = {
			sides: [{
				id: 'side-a', name: 'Side A', color: '#3B82F6',
				squads: [{ id: 'sq1', name: 'Alpha', slots: [
					{ id: 'a1', role: 'SL', access: 'unit' as const, occupant: null },
					{ id: 'a2', role: 'R1', access: 'unit' as const, occupant: null },
					{ id: 'a3', role: 'R2', access: 'priority' as const, occupant: null },
					{ id: 'a4', role: 'R3', access: 'priority' as const, occupant: null },
					{ id: 'a5', role: 'R4', access: 'priority' as const, occupant: null }
				]}]
			}]
		};

		const result = autoConvertUnclaimedSlots(slotting, new Map([['side-a', 4]]));
		expect(result).not.toBeNull();

		const counts = countByAccess(result!, 'side-a');
		expect(counts.unit).toBe(4);
		expect(counts.priority + counts.regular).toBe(1);
	});

	it('does not touch occupied non-unit slots when reverting', async () => {
		const { autoConvertUnclaimedSlots } = await importSlotting();

		const slotting = {
			sides: [{
				id: 'side-a', name: 'Side A', color: '#3B82F6',
				squads: [{ id: 'sq1', name: 'Alpha', slots: [
					{ id: 'a1', role: 'SL', access: 'unit' as const, occupant: null },
					{ id: 'a2', role: 'R1', access: 'priority' as const, occupant: { type: 'user' as const, userId: 1, callsign: 'Test', assignedBy: 'self' as const, assignedAt: '2025-01-01' } },
					{ id: 'a3', role: 'R2', access: 'priority' as const, occupant: null },
					{ id: 'a4', role: 'R3', access: 'regular' as const, occupant: null }
				]}]
			}]
		};

		// 4 total, 3 allocated → need 1 non-unit. Have 3 non-unit (a2 occupied, a3+a4 free).
		// Should revert a3 and a4, keeping a2 (occupied).
		const result = autoConvertUnclaimedSlots(slotting, new Map([['side-a', 3]]));
		expect(result).not.toBeNull();

		const slots = result!.sides[0].squads[0].slots;
		expect(slots[0].access).toBe('unit'); // a1: was unit, stays unit
		expect(slots[1].access).toBe('priority'); // a2: occupied, can't revert
		expect(slots[2].access).toBe('unit'); // a3: reverted
		expect(slots[3].access).toBe('unit'); // a4: reverted
	});

	it('maintains ~2:1 priority:regular ratio when converting', async () => {
		const { autoConvertUnclaimedSlots } = await importSlotting();

		// 9 slots, 3 allocated → 6 convert → 4 priority + 2 regular
		const makeSlots = (count: number) =>
			Array.from({ length: count }, (_, i) => ({
				id: `s-${i + 1}`, role: `R${i + 1}`, access: 'unit' as const, occupant: null
			}));

		const slotting = {
			sides: [{
				id: 's1', name: 'US', color: '#000',
				squads: [{ id: 'sq1', name: 'A', slots: makeSlots(9) }]
			}]
		};

		const result = autoConvertUnclaimedSlots(slotting, new Map([['s1', 3]]));
		expect(result).not.toBeNull();

		const counts = countByAccess(result!, 's1');
		expect(counts.unit).toBe(3);
		expect(counts.priority).toBe(4); // round(6 * 2/3) = 4
		expect(counts.regular).toBe(2);
	});
});
