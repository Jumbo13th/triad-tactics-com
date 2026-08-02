import { describe, expect, it } from 'vitest';
import { balancedScore, computeUnitScores } from '@/features/stats/domain/compute';
import { parseSnapshot, type StatsSnapshot } from '@/features/stats/domain/snapshot';
import type { StatsMapping } from '@/features/stats/domain/types';

const UNIT_A = 1;
const UNIT_B = 2;

// Overrides are raw JSON fragments — the zod parse fills every default, so
// fixtures stay terse.
function buildSnapshot(overrides: Record<string, unknown> = {}): StatsSnapshot {
	const base = {
		schema: 'll-stats/1',
		sessionId: '20260716-190000-TestWorld',
		phase: 'final',
		missionName: 'Test Mission',
		winner: 'US',
		config: {},
		factions: ['US', 'USSR'],
		commanders: [{ faction: 'US', unitTag: 'ALFA' }],
		players: [
			{ guid: 'g-a1', name: 'A1', unitTag: 'ALFA', faction: 'US', participated: true },
			{ guid: 'g-a2', name: 'A2', unitTag: 'ALFA', faction: 'US', participated: true },
			{ guid: 'g-b1', name: 'B1', unitTag: 'BRVO', faction: 'USSR', participated: true },
			{ guid: 'g-none', name: 'Lone', unitTag: '', faction: 'USSR', participated: true },
		],
		events: [] as unknown[],
		zones: [] as unknown[],
	};

	const parsed = parseSnapshot(JSON.stringify({ ...base, ...overrides }));
	if (!parsed.success) throw new Error('fixture snapshot invalid');
	return parsed.snapshot;
}

function mapping(overrides: Partial<StatsMapping> = {}): StatsMapping {
	return {
		guidUnit: { 'g-a1': UNIT_A, 'g-a2': UNIT_A, 'g-b1': UNIT_B, 'g-none': null },
		winner: 'US',
		commanders: [{ faction: 'US', unitId: UNIT_A }],
		...overrides,
	};
}

describe('computeUnitScores', () => {
	it('scores kills, teamkills, survivors and applies winner/commander multipliers', () => {
		const snapshot = buildSnapshot({
			events: [
				{ type: 'kill', actor: 'g-a1', victim: 'g-b1', points: 1 },
				{ type: 'zonekill', actor: 'g-a1', victim: 'g-b1', source: 'Bridge', points: 2 },
				{ type: 'teamkill', actor: 'g-a2', victim: 'g-a1', points: -2 },
				{ type: 'survivor', actor: 'g-a1', points: 1 },
				{ type: 'kill', actor: 'g-b1', victim: 'g-a2', points: 1 },
			],
		});

		const rows = computeUnitScores({ snapshot, config: snapshot.config, mapping: mapping() });

		const unitA = rows.find((r) => r.unitId === UNIT_A);
		const unitB = rows.find((r) => r.unitId === UNIT_B);

		expect(unitA).toBeDefined();
		expect(unitA?.kills).toBe(2);
		expect(unitA?.zoneKills).toBe(1);
		expect(unitA?.teamkills).toBe(1);
		expect(unitA?.survivors).toBe(1);
		// deaths: a1 died to teamkill, a2 died to b1's kill
		expect(unitA?.deaths).toBe(2);
		// base: kill 1 + zonekill 2 + teamkill -2 + survivor 1 = 2
		expect(unitA?.basePoints).toBeCloseTo(2);
		// commander of the winning side → ×1.5
		expect(unitA?.isCommander).toBe(true);
		expect(unitA?.isWinnerSide).toBe(true);
		expect(unitA?.multiplier).toBeCloseTo(1.5);
		expect(unitA?.finalPoints).toBeCloseTo(3);

		expect(unitB?.kills).toBe(1);
		expect(unitB?.isWinnerSide).toBe(false);
		expect(unitB?.multiplier).toBeCloseTo(1);
		// b1 died twice (kill + zonekill both against him)
		expect(unitB?.deaths).toBe(2);
	});

	it('unitless players earn nothing but their deaths credit the killer', () => {
		const snapshot = buildSnapshot({
			events: [
				{ type: 'kill', actor: 'g-none', victim: 'g-a1', points: 1 },
				{ type: 'kill', actor: 'g-a1', victim: 'g-none', points: 1 },
			],
		});

		const rows = computeUnitScores({ snapshot, config: snapshot.config, mapping: mapping() });
		const unitA = rows.find((r) => r.unitId === UNIT_A);

		expect(unitA?.kills).toBe(1);
		expect(unitA?.deaths).toBe(1);
		expect(rows.every((r) => r.unitId !== null)).toBe(true);
	});

	it('the website mapping can rescue a player the game saw as unitless', () => {
		const snapshot = buildSnapshot({
			events: [{ type: 'kill', actor: 'g-none', victim: 'g-a1', points: 1 }],
		});

		const rescued = mapping({ guidUnit: { 'g-a1': UNIT_A, 'g-a2': UNIT_A, 'g-b1': UNIT_B, 'g-none': UNIT_B } });
		const rows = computeUnitScores({ snapshot, config: snapshot.config, mapping: rescued });

		const unitB = rows.find((r) => r.unitId === UNIT_B && r.side === 'USSR');
		expect(unitB?.kills).toBe(1);
	});

	it('clamps key-target shares per (trigger, unit) to cap × distinct actors', () => {
		const snapshot = buildSnapshot({
			events: [
				{ type: 'keytarget', actor: 'g-a1', source: 'trg-1', detail: 'Radar', points: 10, cap: 3 },
				{ type: 'keytarget', actor: 'g-a1', source: 'trg-1', detail: 'Mast', points: 10, cap: 3 },
			],
		});

		const rows = computeUnitScores({ snapshot, config: snapshot.config, mapping: mapping() });
		const unitA = rows.find((r) => r.unitId === UNIT_A);

		// Raw 20 from ONE player, cap 3 × 1 actor = 3.
		expect(unitA?.objectivePoints).toBeCloseTo(3);
	});

	it('splits a captured zone pool by presence among the attacker side and caps tiny units', () => {
		const snapshot = buildSnapshot({
			zones: [
				{
					name: 'Bridge',
					entityName: 'zone_bridge',
					pool: 30,
					maxPerPlayer: 20,
					attackerFaction: 'US',
					defenderFaction: 'USSR',
					captured: true,
					presence: [
						{ guid: 'g-a1', seconds: 300 },
						{ guid: 'g-a2', seconds: 100 },
						{ guid: 'g-b1', seconds: 400 }, // defender — no share of a captured zone
					],
				},
			],
		});

		const rows = computeUnitScores({ snapshot, config: snapshot.config, mapping: mapping() });
		const unitA = rows.find((r) => r.unitId === UNIT_A);
		const unitB = rows.find((r) => r.unitId === UNIT_B);

		// Unit A holds ALL attacker presence → whole pool (cap 20×2=40 not binding).
		expect(unitA?.objectivePoints).toBeCloseTo(30);
		expect(unitB?.objectivePoints ?? 0).toBeCloseTo(0);
	});

	it('awards an uncaptured zone pool to the defenders (held to game end)', () => {
		const snapshot = buildSnapshot({
			zones: [
				{
					name: 'Bridge',
					entityName: 'zone_bridge',
					pool: 30,
					maxPerPlayer: 0,
					attackerFaction: 'US',
					defenderFaction: 'USSR',
					captured: false,
					presence: [
						{ guid: 'g-a1', seconds: 500 },
						{ guid: 'g-b1', seconds: 200 },
					],
				},
			],
		});

		const rows = computeUnitScores({ snapshot, config: snapshot.config, mapping: mapping() });
		const unitB = rows.find((r) => r.unitId === UNIT_B);

		expect(unitB?.objectivePoints).toBeCloseTo(30);
	});

	it('computes occupancy against the allocation on the row own side', () => {
		const snapshot = buildSnapshot({ events: [] });

		const rows = computeUnitScores({
			snapshot,
			config: snapshot.config,
			mapping: mapping(),
			allocatedSlotsByUnit: { [UNIT_A]: { US: 4, USSR: 6 } },
		});

		const unitA = rows.find((r) => r.unitId === UNIT_A);
		expect(unitA?.participants).toBe(2);
		expect(unitA?.occupancyPct).toBe(50);

		const unitB = rows.find((r) => r.unitId === UNIT_B);
		expect(unitB?.occupancyPct).toBeNull();
	});

	// A detachment on a side its unit booked nothing on has no attendance to
	// report — borrowing the main body's allocation would invent a percentage.
	it('leaves occupancy null on a side with no allocation', () => {
		const snapshot = buildSnapshot({ events: [] });

		const rows = computeUnitScores({
			snapshot,
			config: snapshot.config,
			mapping: mapping(),
			allocatedSlotsByUnit: { [UNIT_A]: { USSR: 8 } },
		});

		expect(rows.find((r) => r.unitId === UNIT_A)?.occupancyPct).toBeNull();
	});

	// A unit spread across both factions must not bank a win from whichever
	// detachment happened to land on the winning side.
	describe('a unit split across both sides', () => {
		// UNIT_A: three players on USSR, one (a1, the commander) on the winning US.
		const splitSnapshot = () =>
			buildSnapshot({
				players: [
					{ guid: 'g-a1', name: 'A1', unitTag: 'ALFA', faction: 'US', participated: true },
					{ guid: 'g-a2', name: 'A2', unitTag: 'ALFA', faction: 'USSR', participated: true },
					{ guid: 'g-a3', name: 'A3', unitTag: 'ALFA', faction: 'USSR', participated: true },
					{ guid: 'g-a4', name: 'A4', unitTag: 'ALFA', faction: 'USSR', participated: true },
				],
				events: [{ type: 'kill', actor: 'g-a1', victim: 'g-a2', points: 1 }],
			});

		const splitMapping = () =>
			mapping({ guidUnit: { 'g-a1': UNIT_A, 'g-a2': UNIT_A, 'g-a3': UNIT_A, 'g-a4': UNIT_A } });

		it('wins nothing when its main body is on the losing side', () => {
			const snapshot = splitSnapshot();
			const rows = computeUnitScores({ snapshot, config: snapshot.config, mapping: splitMapping() });

			const detachment = rows.find((r) => r.unitId === UNIT_A && r.side === 'US');
			expect(detachment?.participants).toBe(1);
			expect(detachment?.isWinnerSide).toBe(false);
			expect(detachment?.multiplier).toBeCloseTo(1);
			// The points it earned still stand — only the win bonus is withheld.
			expect(detachment?.basePoints).toBeCloseTo(1);

			expect(rows.find((r) => r.unitId === UNIT_A && r.side === 'USSR')?.isWinnerSide).toBe(false);
		});

		it('wins normally when its main body is on the winning side', () => {
			const snapshot = buildSnapshot({
				players: [
					{ guid: 'g-a1', name: 'A1', unitTag: 'ALFA', faction: 'US', participated: true },
					{ guid: 'g-a2', name: 'A2', unitTag: 'ALFA', faction: 'US', participated: true },
					{ guid: 'g-a3', name: 'A3', unitTag: 'ALFA', faction: 'USSR', participated: true },
				],
				events: [{ type: 'kill', actor: 'g-a1', victim: 'g-a3', points: 1 }],
			});
			const rows = computeUnitScores({ snapshot, config: snapshot.config, mapping: splitMapping() });

			const main = rows.find((r) => r.unitId === UNIT_A && r.side === 'US');
			expect(main?.isWinnerSide).toBe(true);
			expect(main?.multiplier).toBeCloseTo(1.5); // commander of the winning side
		});

		it('wins nothing on an even split', () => {
			const snapshot = buildSnapshot({
				players: [
					{ guid: 'g-a1', name: 'A1', unitTag: 'ALFA', faction: 'US', participated: true },
					{ guid: 'g-a2', name: 'A2', unitTag: 'ALFA', faction: 'USSR', participated: true },
				],
				events: [{ type: 'kill', actor: 'g-a1', victim: 'g-a2', points: 1 }],
			});
			const rows = computeUnitScores({ snapshot, config: snapshot.config, mapping: splitMapping() });

			expect(rows.filter((r) => r.unitId === UNIT_A).every((r) => !r.isWinnerSide)).toBe(true);
			expect(rows.find((r) => r.unitId === UNIT_A && r.side === 'US')?.multiplier).toBeCloseTo(1);
		});

		it('an undivided unit still wins with no participants flagged', () => {
			const snapshot = buildSnapshot({
				players: [{ guid: 'g-a1', name: 'A1', unitTag: 'ALFA', faction: 'US', participated: false }],
				events: [{ type: 'kill', actor: 'g-a1', victim: 'g-b1', points: 1 }],
			});
			const rows = computeUnitScores({ snapshot, config: snapshot.config, mapping: splitMapping() });

			const unitA = rows.find((r) => r.unitId === UNIT_A);
			expect(unitA?.participants).toBe(0);
			expect(unitA?.isWinnerSide).toBe(true);
		});
	});

	it('a draw applies no multipliers', () => {
		const snapshot = buildSnapshot({
			events: [{ type: 'kill', actor: 'g-a1', victim: 'g-b1', points: 1 }],
		});

		const rows = computeUnitScores({ snapshot, config: snapshot.config, mapping: mapping({ winner: 'draw' }) });
		const unitA = rows.find((r) => r.unitId === UNIT_A);

		expect(unitA?.multiplier).toBeCloseTo(1);
		expect(unitA?.isWinnerSide).toBe(false);
	});
});

describe('balancedScore', () => {
	it('dampens by sqrt of average participants at α=0.5', () => {
		// Equal quality per man: big unit (16 players, 160 pts) still beats the
		// small unit (4 players, 40 pts) — but by ×2, not ×4.
		const big = balancedScore(160, 16, 0.5);
		const small = balancedScore(40, 4, 0.5);
		expect(big).toBeCloseTo(40);
		expect(small).toBeCloseTo(20);
	});

	it('α=0 is raw totals, α=1 is per-capita', () => {
		expect(balancedScore(160, 16, 0)).toBeCloseTo(160);
		expect(balancedScore(160, 16, 1)).toBeCloseTo(10);
	});
});
