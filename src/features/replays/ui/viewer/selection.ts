import { segmentAt, valueAt, type Entity, type Life, type ReplayModel } from '../../domain/replayFormat';

// What the viewer shows about the unit picked on the map or in a list.

export type CrewMember = { eid: number; name: string; seat: string; player: boolean };

export type SelectionInfo =
	| {
			kind: 'man';
			eid: number;
			name: string;
			player: boolean;
			side: string | null;
			/** Shown only when the name is a player's, or it would just repeat the name. */
			role: string | null;
			squad: string | null;
			life: Life;
			diedAt: number | null;
			killer: { eid: number; name: string; side: string | null } | null;
			weapon: string | null;
			distance: number | null;
			vehicle: { eid: number; name: string; seat: string } | null;
			kills: number;
	  }
	| { kind: 'vehicle'; eid: number; name: string; side: string | null; wreck: boolean; destroyedAt: number | null; crew: CrewMember[] };

type Names = {
	nicknameOf: (entity: Entity) => string | null;
	nameOf: (entity: Entity) => string;
	callsignFor: (groupKey: string) => string;
	weaponName: (wid: number | null) => string | null;
};

function lastChange(entity: Entity, at: number): number | null {
	for (let i = entity.life.length - 1; i >= 0; i--) if (entity.life[i].t <= at) return entity.life[i].t;
	return null;
}

export function describeSelection(model: ReplayModel, eid: number, at: number, names: Names): SelectionInfo | null {
	const entity = model.entities.get(eid);
	if (!entity) return null;
	const life = valueAt(entity.life, at, 'alive');

	if (entity.kind !== 'man') {
		const crew: CrewMember[] = [];
		for (const other of model.entities.values()) {
			if (other.kind !== 'man' || valueAt(other.life, at, 'alive') === 'dead') continue;
			const seat = valueAt(other.seats, at, null);
			if (seat?.vehicle !== eid) continue;
			const nickname = names.nicknameOf(other);
			crew.push({ eid: other.eid, name: nickname ?? names.nameOf(other), seat: seat.role, player: nickname !== null });
		}
		// Driver, then gunner, then passengers, as a crew is read.
		const order = ['driver', 'gunner', 'cargo'];
		crew.sort((a, b) => order.indexOf(a.seat) - order.indexOf(b.seat));
		return {
			kind: 'vehicle',
			eid,
			name: names.nameOf(entity),
			side: entity.side,
			wreck: life === 'dead',
			destroyedAt: life === 'dead' ? lastChange(entity, at) : null,
			crew,
		};
	}

	const nickname = names.nicknameOf(entity);
	const role = names.nameOf(entity);
	const group = entity.groups.get(segmentAt(model, at));
	let killEvent: Extract<ReplayModel['events'][number], { type: 'kill' }> | null = null;
	let kills = 0;
	for (const event of model.events) {
		if (event.t > at) break;
		if (event.type !== 'kill') continue;
		if (event.victim === eid) killEvent = event;
		else if (event.killer === eid) kills++;
	}
	const killerEntity = life === 'dead' && killEvent?.killer != null && killEvent.killer !== eid ? model.entities.get(killEvent.killer) : undefined;
	const seat = life !== 'dead' ? valueAt(entity.seats, at, null) : null;
	const vehicle = seat ? model.entities.get(seat.vehicle) : undefined;
	return {
		kind: 'man',
		eid,
		name: nickname ?? role,
		player: nickname !== null,
		side: entity.side,
		role: nickname ? role : null,
		squad: group ? names.callsignFor(group) : null,
		life,
		diedAt: life === 'dead' ? lastChange(entity, at) : null,
		killer: killerEntity ? { eid: killerEntity.eid, name: names.nicknameOf(killerEntity) ?? names.nameOf(killerEntity), side: killerEntity.side } : null,
		weapon: life === 'dead' && killEvent ? names.weaponName(killEvent.weapon) : null,
		distance: life === 'dead' && killEvent ? killEvent.distance : null,
		vehicle: seat && vehicle ? { eid: vehicle.eid, name: names.nameOf(vehicle), seat: seat.role } : null,
		kills,
	};
}
