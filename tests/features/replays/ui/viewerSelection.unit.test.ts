import { describe, expect, it } from 'vitest';
import { addSegment, emptyModel, type Entity } from '@/features/replays/domain/replayFormat';
import { gameName } from '@/features/replays/ui/viewer/gameNames';
import { describeSelection } from '@/features/replays/ui/viewer/selection';
import { displayColor, markerColor, sideStyle } from '@/features/replays/ui/viewer/sideStyle';

// One player drives a car, gets out, and shoots an enemy rifleman.
const SEGMENT = [
	'LLR 1',
	'H session 20261101-090000-eden',
	'H segment 1',
	'H mission "Selection"',
	'H world "{853E92315D1D9EFE}worlds/Eden/Eden.ent"',
	'H bounds 0 0 1000 1000',
	'H started 1793600000',
	'H side US "#AR-Faction_US" 048de7',
	'H side USSR "#AR-Faction_USSR" da0807',
	'H end',
	'U 1793600000 0',
	'W 1 rifle "#AR-Weapon_M16A2_Name"',
	'GROUP 1 US "Alpha"',
	'N 1 "[ABC] Player One"',
	'E 1 man US 1 Character_US_SL "#AR-Role_SquadLeader"',
	'E 2 man USSR - Character_USSR_Rifleman "#AR-Role_Rifleman"',
	'E 3 car US - M1025 "#AR-Vehicle_M1025_Name"',
	'P 1 100 100 10 0',
	'P 2 200 200 10 180',
	'P 3 100 100 10 0',
	'C 1 1',
	'T 10',
	'V 1 3 driver "Driver"',
	'T 100',
	'V 1 -',
	'T 130',
	'K 2 1 enemy kinetic 1 50',
	'T 200',
	'P 1 120 100 10 0',
	'',
].join('\n');

function model() {
	const m = emptyModel();
	addSegment(m, SEGMENT);
	return m;
}

const names = {
	nicknameOf: (entity: Entity) => (entity.eid === 1 ? '[ABC] Player One' : null),
	nameOf: (entity: Entity) => gameName({}, entity.name),
	callsignFor: () => 'Alpha',
	weaponName: (wid: number | null) => (wid === 1 ? 'M16A2' : null),
};

describe('describeSelection', () => {
	it('lists who is aboard a vehicle and in which seat', () => {
		const info = describeSelection(model(), 3, 50, names);
		expect(info).toMatchObject({ kind: 'vehicle', wreck: false, crew: [{ eid: 1, name: '[ABC] Player One', seat: 'driver', player: true }] });
	});

	it('shows an empty vehicle once its crew got out', () => {
		expect(describeSelection(model(), 3, 150, names)).toMatchObject({ kind: 'vehicle', crew: [] });
	});

	it('names the killer, weapon and distance of the dead', () => {
		const info = describeSelection(model(), 2, 150, names);
		expect(info).toMatchObject({
			kind: 'man',
			life: 'dead',
			diedAt: 130,
			player: false,
			role: null,
			killer: { eid: 1, name: '[ABC] Player One', side: 'US' },
			weapon: 'M16A2',
			distance: 50,
		});
	});

	it('gives a player their role, squad, seat and kills so far', () => {
		const m = model();
		expect(describeSelection(m, 1, 50, names)).toMatchObject({ name: '[ABC] Player One', player: true, squad: 'Alpha', vehicle: { eid: 3, seat: 'driver' }, kills: 0 });
		expect(describeSelection(m, 1, 150, names)).toMatchObject({ vehicle: null, kills: 1 });
	});
});

describe('side colours', () => {
	it('shows recorded linear colours sRGB-encoded, as the game does', () => {
		expect(displayColor('#048de7')).toBe('#22c4f4');
		expect(displayColor('#da0807')).toBe('#ee322e');
		expect(displayColor('#007014')).toBe('#00b14f');
		expect(displayColor('#048de780')).toBe('#22c4f480');
	});

	it('darkens the edge and lifts text that would be hard to read', () => {
		const us = sideStyle('#048de7');
		const ussr = sideStyle('#da0807');
		expect(us).toEqual({ fill: '#22c4f4', edge: '#12667f', text: '#22c4f4' });
		expect(ussr.edge).toBe('#7c1a18');
		expect(ussr.text).not.toBe(ussr.fill);
	});

	it('tells the marker dialog colours apart by hue', () => {
		expect(markerColor('#da0807')).toBe('red');
		expect(markerColor('#048de7')).toBe('blue');
		expect(markerColor('#007014')).toBe('green');
		expect(markerColor('#ffbf00')).toBe('yellow');
		expect(markerColor('#2a2a2a')).toBe('black');
		expect(markerColor(null)).toBeNull();
	});
});
