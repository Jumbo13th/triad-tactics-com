import type { StatsConfig, StatsSnapshot } from './snapshot';
import type { AllocatedSlotsByUnit, GameTimelineEvent, StatsMapping, UnitScore } from './types';

export type ComputeInput = {
	snapshot: StatsSnapshot;
	config: StatsConfig;
	mapping: StatsMapping;
	// Slots allocated to each unit in the episode slotting (occupancy
	// denominator); missing key → occupancy stays null for that unit.
	allocatedSlotsByUnit?: AllocatedSlotsByUnit;
};

type RowKey = string; // `${unitId}|${side}`

/**
 * The authoritative score engine: recomputes everything from the snapshot's
 * raw events through the WEBSITE's frozen GUID→unit mapping (never the game's
 * advisory numbers). Zone pools re-split from presence-seconds, key-target
 * shares clamped to cap × distinct actors; unmapped players earn nothing but
 * their deaths still count for killers.
 */
export function computeUnitScores(input: ComputeInput): UnitScore[] {
	const { snapshot, config, mapping } = input;

	const playersByGuid = new Map(snapshot.players.map((p) => [p.guid, p]));
	const unitOf = (guid: string): number | null => mapping.guidUnit[guid] ?? null;

	const rows = new Map<RowKey, UnitScore>();
	const ordered: UnitScore[] = [];

	const rowFor = (unitId: number, side: string): UnitScore => {
		const key: RowKey = `${unitId}|${side}`;
		const existing = rows.get(key);
		if (existing) return existing;

		const row: UnitScore = {
			unitId,
			side,
			kills: 0,
			zoneKills: 0,
			aiKills: 0,
			teamkills: 0,
			deaths: 0,
			survivors: 0,
			participants: 0,
			occupancyPct: null,
			objectivePoints: 0,
			basePoints: 0,
			multiplier: 1,
			finalPoints: 0,
			isCommander: false,
			isWinnerSide: false,
		};
		rows.set(key, row);
		ordered.push(row);
		return row;
	};

	const rowForGuid = (guid: string): UnitScore | null => {
		const unitId = unitOf(guid);
		if (unitId === null) return null;
		const player = playersByGuid.get(guid);
		return rowFor(unitId, player?.faction ?? '');
	};

	const ktRaw = new Map<string, { raw: number; cap: number; actors: Set<string>; row: UnitScore }>();

	for (const ev of snapshot.events) {
		if (ev.victim) {
			const victimRow = rowForGuid(ev.victim);
			if (victimRow) victimRow.deaths++;
		}

		if (!ev.actor) continue;
		const row = rowForGuid(ev.actor);
		if (!row) continue;

		switch (ev.type) {
			case 'kill':
				row.kills++;
				row.basePoints += config.FragPoints;
				break;
			case 'zonekill':
				row.kills++;
				row.zoneKills++;
				row.basePoints += ev.points > 0 ? ev.points : config.FragPoints * config.ZoneFragMultiplier;
				break;
			case 'aikill':
				row.aiKills++;
				row.basePoints += config.FragPoints * config.AiKillWeight;
				break;
			case 'teamkill':
				row.teamkills++;
				row.basePoints += config.TeamkillPoints;
				break;
			case 'survivor':
				row.survivors++;
				row.basePoints += config.SurvivorPoints;
				break;
			// groupkill = defeat-trigger member kills: same pool semantics as key
			// targets (per-share events, cap × distinct actors), only excluded
			// from the public timeline (the group wipe is the timeline entry).
			case 'keytarget':
			case 'groupkill': {
				const key = `${ev.source}|${row.unitId}|${row.side}`;
				const entry = ktRaw.get(key) ?? { raw: 0, cap: ev.cap, actors: new Set<string>(), row };
				entry.raw += ev.points;
				entry.cap = ev.cap;
				entry.actors.add(ev.actor);
				ktRaw.set(key, entry);
				break;
			}
			default:
				break; // capture/defense/trigger/death carry no unit points here
		}
	}

	for (const entry of ktRaw.values()) {
		let awarded = entry.raw;
		if (entry.cap > 0) awarded = Math.min(awarded, entry.cap * entry.actors.size);
		entry.row.objectivePoints += awarded;
	}

	for (const zone of snapshot.zones) {
		if (zone.pool <= 0) continue;

		const winSide = zone.captured ? zone.attackerFaction : zone.defenderFaction;
		if (!winSide) continue;

		const byUnit = new Map<number, { seconds: number; contributors: number }>();
		let totalSeconds = 0;

		for (const presence of zone.presence) {
			const unitId = unitOf(presence.guid);
			if (unitId === null) continue;
			const player = playersByGuid.get(presence.guid);
			if (!player || player.faction !== winSide) continue;

			const entry = byUnit.get(unitId) ?? { seconds: 0, contributors: 0 };
			entry.seconds += presence.seconds;
			entry.contributors++;
			byUnit.set(unitId, entry);
			totalSeconds += presence.seconds;
		}

		if (totalSeconds <= 0) continue;

		for (const [unitId, entry] of byUnit) {
			let share = (zone.pool * entry.seconds) / totalSeconds;
			if (zone.maxPerPlayer > 0) share = Math.min(share, zone.maxPerPlayer * entry.contributors);
			rowFor(unitId, winSide).objectivePoints += share;
		}
	}

	// A unit that showed up but scored nothing still gets a row.
	for (const player of snapshot.players) {
		if (!player.participated) continue;
		const unitId = unitOf(player.guid);
		if (unitId === null) continue;
		rowFor(unitId, player.faction).participants++;
	}

	const winnerDeclared = mapping.winner !== '' && mapping.winner !== 'draw';
	const commanderByFaction = new Map(mapping.commanders.map((c) => [c.faction, c.unitId]));
	const primarySide = resolvePrimarySides(ordered);

	for (const row of ordered) {
		row.isCommander = commanderByFaction.get(row.side) === row.unitId;

		const raw = row.basePoints + row.objectivePoints;

		// Win multipliers only reward positive work — never deepen a
		// teamkill-negative total; the winner flag itself stays.
		if (winnerDeclared && row.side === mapping.winner && primarySide.get(row.unitId) === row.side) {
			row.isWinnerSide = true;
			if (raw > 0) row.multiplier = row.isCommander ? config.CommanderWinMultiplier : config.SideWinMultiplier;
		}

		// Floor: teamkills can wipe a unit's game to zero, but a game never
		// digs into the season total (the game addon mirrors both rules).
		row.finalPoints = Math.max(0, round1(raw * row.multiplier));
		row.basePoints = round1(row.basePoints);
		row.objectivePoints = round1(row.objectivePoints);

		// Strictly this row's own side: a detachment on the far side was allocated
		// nothing there, and measuring it against the main body's allocation on
		// the OTHER side invents a percentage. No allocation → no attendance.
		const allocated = input.allocatedSlotsByUnit?.[row.unitId]?.[row.side] ?? 0;
		if (allocated > 0) {
			row.occupancyPct = Math.round((row.participants / allocated) * 100);
		}
	}

	return ordered;
}

/**
 * The one side that IS each unit this game: the one carrying most of its
 * players. A unit spread across both factions would otherwise bank a win every
 * single game — whichever detachment happened to land on the winning side
 * collects the flag and the multiplier while the main body loses (a two-man
 * splinter has done exactly that). Only the majority side can win; the rest is
 * a detachment that keeps its points but earns the unit nothing.
 *
 * An even split commits to neither side — otherwise a perfect 5/5 hedge still
 * banks a win from whichever half got lucky.
 */
function resolvePrimarySides(rows: UnitScore[]): Map<number, string | null> {
	const sidesByUnit = new Map<number, UnitScore[]>();
	for (const row of rows) {
		const list = sidesByUnit.get(row.unitId);
		if (list) list.push(row);
		else sidesByUnit.set(row.unitId, [row]);
	}

	const primary = new Map<number, string | null>();
	for (const [unitId, sideRows] of sidesByUnit) {
		// Undivided unit: its only side is its side, whatever the head count —
		// a unit whose players all went unflagged must not forfeit its win.
		if (sideRows.length === 1) {
			primary.set(unitId, sideRows[0].side);
			continue;
		}

		let best: UnitScore | null = null;
		let tied = false;
		for (const row of sideRows) {
			if (!best || row.participants > best.participants) {
				best = row;
				tied = false;
			} else if (row.participants === best.participants) {
				tied = true;
			}
		}
		primary.set(unitId, tied ? null : (best?.side ?? null));
	}

	return primary;
}

/** Public timeline events (captures, holds, targets, triggers) — kill noise stays out. */
export function extractTimeline(snapshot: StatsSnapshot): GameTimelineEvent[] {
	const timeline: GameTimelineEvent[] = [];
	for (const ev of snapshot.events) {
		if (ev.type === 'capture' || ev.type === 'defense' || ev.type === 'trigger') {
			timeline.push({ t: ev.t, type: ev.type === 'trigger' ? 'trigger' : ev.type, text: ev.detail });
		} else if (ev.type === 'keytarget') {
			timeline.push({ t: ev.t, type: 'keytarget', text: ev.detail });
		}
	}
	return timeline;
}

/** Season ranking key: raw ÷ avgParticipants^α (α=0 pure totals, α=1 pure per-capita). */
export function balancedScore(rawPoints: number, avgParticipants: number, alpha: number): number {
	const n = Math.max(1, avgParticipants);
	return round1(rawPoints / Math.pow(n, alpha));
}

function round1(value: number): number {
	return Math.round(value * 10) / 10;
}
