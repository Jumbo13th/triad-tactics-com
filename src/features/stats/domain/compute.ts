import type { StatsConfig, StatsSnapshot } from './snapshot';
import type { GameTimelineEvent, StatsMapping, UnitScore } from './types';

export type ComputeInput = {
	snapshot: StatsSnapshot;
	config: StatsConfig;
	mapping: StatsMapping;
	// Slots each unit's members claimed in the episode slotting (occupancy
	// denominator); missing key → occupancy stays null for that unit.
	claimedSlotsByUnit?: Record<number, number>;
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
			case 'keytarget': {
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

	for (const row of ordered) {
		row.isCommander = commanderByFaction.get(row.side) === row.unitId;

		if (winnerDeclared && row.side === mapping.winner) {
			row.isWinnerSide = true;
			row.multiplier = row.isCommander ? config.CommanderWinMultiplier : config.SideWinMultiplier;
		}

		row.finalPoints = round1((row.basePoints + row.objectivePoints) * row.multiplier);
		row.basePoints = round1(row.basePoints);
		row.objectivePoints = round1(row.objectivePoints);

		const claimed = input.claimedSlotsByUnit?.[row.unitId];
		if (claimed !== undefined && claimed > 0) {
			row.occupancyPct = Math.round((row.participants / claimed) * 100);
		}
	}

	return ordered;
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
